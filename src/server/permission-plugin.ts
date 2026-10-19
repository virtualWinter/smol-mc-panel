import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { safePath } from './paths'
import { readPermissionSources } from './permission-sources'

const execute = promisify(execFile)
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
export type PermissionPlatform = 'paper' | 'velocity'

/** Stable identifier for the current plugin sources, used to detect stale installs. */
export function permissionSignature(platform: PermissionPlatform): string {
  const { sources, descriptor } = readPermissionSources(platform)
  return hash(JSON.stringify({ format: 1, sources, descriptor }))
}

/** Builds the permission plugin with the managed JDK. Cached until the sources change. */
export async function buildPermissionPlugin(root: string, java: string, platform: PermissionPlatform): Promise<string> {
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const directory = safePath(root, 'permission-plugin')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const jar = safePath(directory, `smol-panel-${platform}.jar`), record = safePath(directory, `${platform}.json`)
  const { sources, descriptor } = readPermissionSources(platform)
  const signature = hash(JSON.stringify({ format: 1, sources, descriptor }))
  const cached = readJson<{ signature: string; jarHash: string } | undefined>(record, undefined)
  if (cached && existsSync(jar)) {
    try {
      if (cached.signature === signature && cached.jarHash === hash(readFileSync(jar))) return jar
    } catch { /* Rebuild corrupt or outdated artifacts. */ }
  }
  const work = safePath(directory, `.build-${randomUUID()}`)
  mkdirSync(work, { mode: 0o700 })
  try {
    const sourceRoot = resolve(work, 'source'), classes = resolve(work, 'classes')
    mkdirSync(classes)
    const files: string[] = []
    for (const [path, source] of Object.entries(sources)) {
      const file = resolve(sourceRoot, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, source)
      files.push(file)
    }
    writeFileSync(resolve(classes, descriptor.path), descriptor.content)
    const bin = dirname(java)
    await execute(resolve(bin, 'javac'), ['--release', '17', '-d', classes, ...files], { timeout: 60_000 })
    // Only `cc/` ships: the compile-only platform shims must not shadow the server's own classes.
    await execute(resolve(bin, 'jar'), ['--create', '--file', resolve(work, 'plugin.jar'), '-C', classes, 'cc', '-C', classes, descriptor.path], { timeout: 30_000 })
    renameSync(resolve(work, 'plugin.jar'), jar)
    saveJson(record, { signature, jarHash: hash(readFileSync(jar)) })
    return jar
  } catch (error) {
    if (error instanceof PanelError) throw error
    throw new PanelError(`Could not build the permission plugin with the managed JDK: ${error instanceof Error ? error.message.slice(0, 800) : 'unknown error'}`)
  } finally { rmSync(work, { recursive: true, force: true }) }
}
