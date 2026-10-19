import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { safePath } from './paths'

const execute = promisify(execFile)
const asmVersion = '9.9.1'
const asmHash = '6f3828a215c920059a5efa2fb55c233d6c54ec5cadca99ce1b1bdd10077c7ddd'
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')

// Relocate the private ASM dependency so it cannot shadow the server's ASM copy.
export function relocateClass(bytes: Buffer): Buffer {
  if (bytes.readUInt32BE(0) !== 0xcafebabe) throw new Error('Invalid class file')
  const parts = [bytes.subarray(0, 10)]
  let offset = 10
  for (let index = 1; index < bytes.readUInt16BE(8); index++) {
    const start = offset, tag = bytes[offset++]
    if (tag === 1) {
      const size = bytes.readUInt16BE(offset); offset += 2
      const value = bytes.subarray(offset, offset + size).toString('latin1').replaceAll('org/objectweb/asm', 'cc/arsn/panel/metrics/internal/asm').replaceAll('org.objectweb.asm', 'cc.arsn.panel.metrics.internal.asm')
      const encoded = Buffer.from(value, 'latin1'), header = Buffer.alloc(3)
      header[0] = 1; header.writeUInt16BE(encoded.length, 1)
      parts.push(header, encoded); offset += size
    } else {
      const size = tag === 3 || tag === 4 ? 4 : tag === 5 || tag === 6 ? 8 : [7, 8, 16, 19, 20].includes(tag) ? 2 : [9, 10, 11, 12, 17, 18].includes(tag) ? 4 : tag === 15 ? 3 : 0
      if (!size) throw new Error('Unknown class constant')
      offset += size
      if (tag === 5 || tag === 6) index++
      parts.push(bytes.subarray(start, offset))
    }
  }
  parts.push(bytes.subarray(offset))
  return Buffer.concat(parts)
}

function classFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? classFiles(resolve(root, entry.name)) : entry.name.endsWith('.class') ? [resolve(root, entry.name)] : [])
}

export async function buildAgent(root: string, java: string, sources: Record<string, string>): Promise<string> {
  const directory = safePath(root, 'agents')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const agentJar = safePath(directory, 'metrics-agent.jar'), bridgeJar = safePath(directory, 'metrics-bridge.jar'), record = safePath(directory, 'build.json')
  const signature = hash(JSON.stringify({ format: 1, asmHash, sources }))
  const cached = readJson<{ signature: string; agentHash: string; bridgeHash: string } | undefined>(record, undefined)
  if (cached && existsSync(agentJar) && existsSync(bridgeJar)) {
    try {
      if (cached.signature === signature && cached.agentHash === hash(readFileSync(agentJar)) && cached.bridgeHash === hash(readFileSync(bridgeJar))) return agentJar
    } catch { /* Rebuild corrupt or outdated artifacts. */ }
  }
  const work = safePath(directory, `.build-${randomUUID()}`)
  mkdirSync(work, { mode: 0o700 })
  try {
    const asm = safePath(directory, `asm-${asmVersion}.jar`)
    if (!existsSync(asm) || hash(readFileSync(asm)) !== asmHash) {
      const response = await fetch(`https://repo.maven.apache.org/maven2/org/ow2/asm/asm/${asmVersion}/asm-${asmVersion}.jar`, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
      if (!response.ok || !response.body) throw new PanelError('Could not download the metrics agent build dependency.')
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of response.body) { size += chunk.length; if (size > 1024 * 1024) throw new PanelError('Agent build dependency was too large.'); chunks.push(Buffer.from(chunk)) }
      const bytes = Buffer.concat(chunks)
      if (hash(bytes) !== asmHash) throw new PanelError('Metrics agent dependency checksum did not match.')
      writeFileSync(`${asm}.tmp`, bytes, { mode: 0o600 }); renameSync(`${asm}.tmp`, asm)
    }
    const classes = resolve(work, 'classes'), bridgeClasses = resolve(work, 'bridge-classes'), sourceRoot = resolve(work, 'source/cc/arsn/panel/metrics')
    mkdirSync(classes); mkdirSync(sourceRoot, { recursive: true }); mkdirSync(resolve(bridgeClasses, 'cc/arsn/panel/metrics'), { recursive: true })
    for (const [name, source] of Object.entries(sources)) writeFileSync(resolve(sourceRoot, name), source)
    const bin = dirname(java)
    await execute(resolve(bin, 'javac'), ['--release', '17', '-cp', asm, '-d', classes, ...Object.keys(sources).map((name) => resolve(sourceRoot, name))], { timeout: 60_000 })
    await execute(resolve(bin, 'jar'), ['xf', asm], { cwd: classes, timeout: 30_000 })
    for (const path of classFiles(classes)) {
      if (path.endsWith('/module-info.class')) continue
      const relative = path.slice(classes.length + 1).replaceAll('org/objectweb/asm', 'cc/arsn/panel/metrics/internal/asm')
      const destination = resolve(classes, relative)
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, relocateClass(readFileSync(path)))
    }
    renameSync(resolve(classes, 'cc/arsn/panel/metrics/Bridge.class'), resolve(bridgeClasses, 'cc/arsn/panel/metrics/Bridge.class'))
    const manifest = resolve(work, 'MANIFEST.MF')
    writeFileSync(manifest, 'Manifest-Version: 1.0\nPremain-Class: cc.arsn.panel.metrics.Agent\n\n')
    await execute(resolve(bin, 'jar'), ['--create', '--file', resolve(work, 'metrics-agent.jar'), '--manifest', manifest, '-C', classes, 'cc'], { timeout: 30_000 })
    await execute(resolve(bin, 'jar'), ['--create', '--file', resolve(work, 'metrics-bridge.jar'), '-C', bridgeClasses, 'cc'], { timeout: 30_000 })
    renameSync(resolve(work, 'metrics-bridge.jar'), bridgeJar); renameSync(resolve(work, 'metrics-agent.jar'), agentJar)
    saveJson(record, { signature, agentHash: hash(readFileSync(agentJar)), bridgeHash: hash(readFileSync(bridgeJar)) })
    return agentJar
  } catch (error) {
    if (error instanceof PanelError) throw error
    throw new PanelError(`Could not build the metrics agent with the managed JDK: ${error instanceof Error ? error.message.slice(0, 800) : 'unknown error'}`)
  } finally { rmSync(work, { recursive: true, force: true }) }
}
