import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync, unlinkSync, writeSync } from 'node:fs'
import { posix, resolve } from 'node:path'
import { x as extract } from 'tar'
import type { DownloadProgressState } from '../types'
import { PanelError } from './errors'
import { safePath } from './paths'

export function javaMajor(executable: string): number | undefined {
  const result = spawnSync(executable, ['-version'], { encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024, shell: false })
  if (result.error || result.status !== 0) return
  const value = `${result.stdout}\n${result.stderr}`.match(/(?:java|openjdk)\s+(?:version\s+)?"?(?:1\.)?(\d+)/iu)?.[1]
  return value ? Number(value) : undefined
}

export function managedJava(root: string, major: number): string | undefined {
  const managed = safePath(root, `java/java-${major}/bin/java`)
  if (existsSync(managed) && javaMajor(managed) === major) return managed
}

async function fetchArchive(url: string, request: typeof fetch, signal: AbortSignal) {
  for (let redirects = 0; redirects < 6; redirects++) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password || !['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname)) throw new PanelError('Java download redirected to an untrusted host.')
    const response = await request(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'smol-mc-panel/0.0.0 (https://arsn.cc; admin@arsn.cc)' } })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new PanelError('Java download returned an invalid redirect.')
      url = new URL(location, url).href
      continue
    }
    if (!response.ok || !response.body) throw new PanelError(`Java download failed (${response.status}).`)
    return response
  }
  throw new PanelError('Too many Java download redirects.')
}

interface JavaOptions {
  root: string
  major: number
  request?: typeof fetch
  onProgress?: (progress: DownloadProgressState) => void
}

export async function installJava({ root, major, request = fetch, onProgress }: JavaOptions): Promise<string> {
  if (![17, 21, 25].includes(major)) throw new PanelError('Unsupported Java version.')
  if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) throw new PanelError('Panel-managed Java currently supports Linux x64/arm64.')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const javaRoot = safePath(root, 'java')
  mkdirSync(javaRoot, { recursive: true, mode: 0o700 })
  const target = safePath(javaRoot, `java-${major}`)
  const executable = resolve(target, 'bin/java')
  if (existsSync(target)) {
    if (javaMajor(safePath(javaRoot, `java-${major}/bin/java`)) === major) return executable
    throw new PanelError(`data/java/java-${major} exists but is not a working Java ${major} installation. Repair or move it before retrying.`)
  }
  const staging = safePath(javaRoot, `.java-${major}-${randomUUID()}`)
  const archive = `${staging}.tar.gz`
  const label = `Java ${major}`
  let received = 0, total = 0
  const started = performance.now()
  const report = (phase: DownloadProgressState['phase']) => onProgress?.({ phase, label, received, total, bytesPerSecond: received / Math.max(0.001, (performance.now() - started) / 1000) })
  let descriptor: number | undefined
  report('resolving')
  try {
    const architecture = process.arch === 'arm64' ? 'aarch64' : 'x64'
    const metadata = await request(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${architecture}&image_type=jdk&os=linux&vendor=eclipse`, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'smol-mc-panel/0.0.0 (https://arsn.cc; admin@arsn.cc)' } })
    if (!metadata.ok || !metadata.body) throw new PanelError(`Could not find Java ${major} (${metadata.status}).`)
    const chunks: Buffer[] = []
    let metadataSize = 0
    for await (const chunk of metadata.body) {
      metadataSize += chunk.length
      if (metadataSize > 1024 * 1024) throw new PanelError('Java release metadata was too large.')
      chunks.push(Buffer.from(chunk))
    }
    const releases = JSON.parse(Buffer.concat(chunks).toString()) as { version: { major: number }; binary: { architecture: string; os: string; image_type: string; package: { checksum: string; size: number; link: string } } }[]
    const release = Array.isArray(releases) ? releases.find((item) => item.version?.major === major && item.binary?.architecture === architecture && item.binary.os === 'linux' && item.binary.image_type === 'jdk') : undefined
    const source = release?.binary.package
    if (!source || !/^[a-f0-9]{64}$/u.test(source.checksum) || !Number.isInteger(source.size) || source.size < 1 || source.size > 512 * 1024 * 1024 || !source.link.startsWith(`https://github.com/adoptium/temurin${major}-binaries/releases/download/`)) throw new PanelError('Adoptium returned invalid Java release metadata.')
    total = source.size
    report('downloading')
    const response = await fetchArchive(source.link, request, AbortSignal.timeout(300_000))
    const declared = Number(response.headers.get('content-length'))
    if (declared && declared !== total) throw new PanelError('Java archive size did not match the release metadata.')
    descriptor = openSync(archive, 'wx', 0o600)
    const hash = createHash('sha256')
    for await (const chunk of response.body!) {
      received += chunk.length
      if (received > total) throw new PanelError('Java archive exceeded the expected size.')
      hash.update(chunk)
      const bytes = Buffer.from(chunk)
      let offset = 0
      while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset)
      report('downloading')
    }
    closeSync(descriptor); descriptor = undefined
    report('verifying')
    if (received !== total || hash.digest('hex') !== source.checksum) throw new PanelError('Java archive verification failed.')
    mkdirSync(staging, { mode: 0o700 })
    report('extracting')
    let unsafe = false, expandedSize = 0, topLevel: string | undefined
    await extract({ file: archive, cwd: staging, strip: 1, strict: true, preservePaths: false, filter(path, entry) {
      if (!('type' in entry)) { unsafe = true; return false }
      const parts = path.split('/').filter(Boolean)
      const invalid = path.startsWith('/') || path.includes('\\') || parts.some((part) => part === '.' || part === '..') || !parts.length || (topLevel !== undefined && parts[0] !== topLevel)
      topLevel ??= parts[0]
      expandedSize += entry.size
      if (!Number.isSafeInteger(expandedSize) || expandedSize > 2 * 1024 ** 3) { unsafe = true; return false }
      if (invalid || !['File', 'Directory', 'SymbolicLink', 'Link'].includes(entry.type)) { unsafe = true; return false }
      if (entry.type === 'SymbolicLink' || entry.type === 'Link') {
        const link = entry.linkpath
        if (typeof link !== 'string' || !link) { unsafe = true; return false }
        const stripped = parts.slice(1).join('/')
        const linkTarget = entry.type === 'SymbolicLink' ? posix.resolve('/java', posix.dirname(stripped), link) : posix.resolve('/java', link.split('/').slice(1).join('/'))
        if (link.startsWith('/') || link.includes('\\') || !linkTarget.startsWith('/java/') || (entry.type === 'Link' && link.split('/')[0] !== topLevel)) { unsafe = true; return false }
      }
      return true
    } })
    if (unsafe) throw new PanelError('Java archive contained unsafe paths or links.')
    const extracted = safePath(staging, 'bin/java')
    if (javaMajor(extracted) !== major) throw new PanelError('Downloaded Java could not run or reported the wrong version.')
    report('installing')
    // The final directory is created only after archive and executable verification.
    if (existsSync(target)) throw new PanelError(`java-${major} was created by another process; retry the operation.`)
    renameSync(staging, target)
    report('complete')
    return executable
  } catch (error) {
    if (error instanceof PanelError) throw error
    throw new PanelError(`Could not install Java ${major}. Check connectivity, disk space, and system compatibility.`)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    if (existsSync(archive)) unlinkSync(archive)
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
  }
}
