import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { PanelError } from './errors'
import { processAlive, registration } from './liveness'
import { safePath } from './paths'

function assertStopped(root: string) {
  const pidFiles = ['.panel.lock', 'processes.json']
  for (const name of pidFiles) {
    const path = resolve(root, name)
    if (!existsSync(path)) continue
    let data: unknown
    try { data = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new PanelError('Invalid process registry. Inspect it before migrating data.') }
    const values = name === '.panel.lock' ? [data] : Object.values(data as Record<string, unknown>)
    for (const value of values) {
      const entry = registration(value)
      if (!entry) throw new PanelError('Invalid process registry. Inspect it before migrating data.')
      if (processAlive(entry.pid, entry.start)) throw new PanelError('Stop the panel and managed servers before migrating their data directory.')
    }
  }
}

export function prepareStorage(cwd: string, customRoot?: string): string {
  const root = resolve(cwd, customRoot || 'data')
  const legacy = resolve(cwd, 'network')
  if (!customRoot && existsSync(resolve(legacy, 'panel.json'))) {
    if (existsSync(root)) throw new PanelError('Both network/ and data/ exist. Move or merge them manually with the panel stopped; nothing was overwritten.')
    assertStopped(legacy)
    renameSync(legacy, root)
  }
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const legacyJavas = readdirSync(root).filter((name) => /^java-\d+$/u.test(name))
  if (legacyJavas.length) {
    assertStopped(root)
    const javaRoot = safePath(root, 'java')
    mkdirSync(javaRoot, { recursive: true, mode: 0o700 })
    // Check every destination before moving anything.
    for (const name of legacyJavas) if (existsSync(safePath(javaRoot, name))) throw new PanelError(`Cannot migrate ${name}: data/java/${name} already exists.`)
    for (const name of legacyJavas) renameSync(safePath(root, name), safePath(javaRoot, name))
  }
  mkdirSync(safePath(root, 'java'), { recursive: true, mode: 0o700 })
  mkdirSync(safePath(root, 'servers'), { recursive: true, mode: 0o700 })
  return root
}
