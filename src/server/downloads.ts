import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PanelError } from './errors'
import { safePath } from './paths'
import { MAX_UPLOAD } from './files'
import { readJson, saveJson } from './json-store'
import type { DownloadProgressState } from '../types'

const api = 'https://fill.papermc.io/v3/projects'
interface JarSource {
  project: 'paper' | 'velocity'
  version: string
  build: number
  jarFile: string
  url: string
  sha256?: string
  md5?: string
  size: number
}

function validateSource(value: JarSource): JarSource {
  const url = new URL(value.url)
  const validChecksum = typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(value.sha256)
  const validUrl = url.hostname === 'fill-data.papermc.io'
  if (!['paper', 'velocity'].includes(value.project) || typeof value.version !== 'string' || !Number.isInteger(value.build) || value.build < 1 || !validChecksum || (value.md5 !== undefined && !/^[a-f0-9]{32}$/u.test(value.md5)) || !Number.isInteger(value.size) || value.size < 4 || value.size > MAX_UPLOAD || !validUrl || url.protocol !== 'https:' || url.port || url.username || url.password) throw new PanelError('The download service returned invalid JAR metadata.')
  return value
}

export function installedSource(manifest: string, project: string, jarFile: string): JarSource | undefined {
  const stored = readJson<JarSource | undefined>(manifest, undefined)
  if (!stored) return
  try {
    const source = validateSource(stored)
    if (source.project === project && source.jarFile === jarFile) return source
  } catch { /* Unknown/manual installations require an explicit latest-stable confirmation. */ }
}

async function readMetadata(response: Response, limit = 8 * 1024 * 1024): Promise<string> {
  if (!response.ok || !response.body) throw new PanelError(`Download metadata request failed (${response.status}).`)
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw new PanelError('Download metadata response was too large.')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function latestSource(project: JarSource['project'], jarFile: string, request: typeof fetch, userAgent: string): Promise<JarSource> {
  const get = (url: string) => request(url, { headers: { 'User-Agent': userAgent }, redirect: 'error', signal: AbortSignal.timeout(15_000) }).then(readMetadata).then((text) => JSON.parse(text) as unknown)
  const data = await get(`${api}/${project}`) as { versions?: Record<string, string[]> }
  if (!data.versions || typeof data.versions !== 'object') throw new PanelError('PaperMC returned an invalid version list.')
  const versions = Object.values(data.versions).flat().filter((version): version is string => typeof version === 'string' && /^[\d.]+(?:-SNAPSHOT)?$/u.test(version))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  for (const version of versions.slice(0, 20)) {
    const builds = await get(`${api}/${project}/versions/${encodeURIComponent(version)}/builds`) as { id: number; channel: string; downloads?: Record<string, { url: string; checksums: { sha256: string }; size: number }> }[]
    if (!Array.isArray(builds)) throw new PanelError('PaperMC returned an invalid build list.')
    const build = builds.filter((item) => item.channel === 'STABLE' && item.downloads?.['server:default']).sort((a, b) => b.id - a.id)[0]
    if (!build) continue
    const download = build.downloads!['server:default']
    return validateSource({ project, jarFile, version, build: build.id, url: download.url, sha256: download.checksums?.sha256, size: download.size })
  }
  throw new PanelError('No stable PaperMC build was found.')
}

interface ReinstallOptions {
  directory: string
  jarFile: string
  project: JarSource['project']
  manifest: string
  userAgent?: string
  request?: typeof fetch
  onProgress?: (progress: DownloadProgressState) => void
}

export async function reinstallJar({ directory, jarFile, project, manifest, userAgent = process.env.PAPERMC_USER_AGENT || 'smol-mc-panel/0.0.0 (https://arsn.cc; admin@arsn.cc)', request = fetch, onProgress }: ReinstallOptions) {
  onProgress?.({ phase: 'resolving', received: 0, total: 0, bytesPerSecond: 0 })
  if (!userAgent || userAgent.length > 512 || /[\r\n]/u.test(userAgent) || !/(?:https?:\/\/|mailto:|@)/u.test(userAgent)) throw new PanelError('Set PAPERMC_USER_AGENT to identify your panel with a contact URL or email, as required by PaperMC.')
  const target = safePath(directory, jarFile)
  if (!existsSync(dirname(target))) throw new PanelError('The configured JAR directory does not exist.')
  const source = installedSource(manifest, project, jarFile) ?? await latestSource(project, jarFile, request, userAgent)
  const started = performance.now()
  const report = (phase: DownloadProgressState['phase'], received: number) => onProgress?.({ phase, received, total: source.size, bytesPerSecond: received / Math.max(0.001, (performance.now() - started) / 1000) })
  report('downloading', 0)
  const temporary = resolve(dirname(target), `.panel-download-${randomUUID()}.tmp`)
  let descriptor: number | undefined
  try {
    const response = await request(source.url, { headers: { 'User-Agent': userAgent }, redirect: 'error', signal: AbortSignal.timeout(120_000) })
    if (!response.ok || !response.body) throw new PanelError(`JAR download failed (${response.status}).`)
    const declared = Number(response.headers.get('content-length'))
    if (declared && declared !== source.size) throw new PanelError('JAR download size did not match PaperMC metadata.')
    descriptor = openSync(temporary, 'wx', 0o600)
    let size = 0
    const hash = createHash('sha256')
    const md5 = source.md5 ? createHash('md5') : undefined
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > source.size || size > MAX_UPLOAD) throw new PanelError('JAR download exceeded the expected size.')
      hash.update(chunk)
      md5?.update(chunk)
      const bytes = Buffer.from(chunk)
      let offset = 0
      while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset)
      report('downloading', size)
    }
    closeSync(descriptor); descriptor = undefined
    report('verifying', size)
    const sha256 = hash.digest('hex')
    if (size !== source.size || (source.sha256 && sha256 !== source.sha256) || (source.md5 && md5!.digest('hex') !== source.md5)) throw new PanelError('JAR verification failed. The existing JAR was not changed.')
    // Jenkins publishes an MD5 fingerprint, not SHA-256. Pin our verified bytes with
    // SHA-256 too, so reinstalls check the primary fingerprint.
    source.sha256 = sha256
    report('installing', size)
    // Never truncate the existing JAR: replace it only after the full download verifies.
    renameSync(temporary, target)
    saveJson(manifest, source)
    report('complete', size)
    return source
  } catch (error) {
    if (error instanceof PanelError) throw error
    throw new PanelError('Could not download the server JAR. Check connectivity and the download service; the server was not started.')
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}
