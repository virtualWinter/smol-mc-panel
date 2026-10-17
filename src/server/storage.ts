import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { PanelError } from './errors'
import { safePath } from './paths'

function assertStopped(root: string) {
  const pidFiles = ['.panel.lock', 'processes.json']
  for (const name of pidFiles) {
    const path = resolve(root, name)
    if (!existsSync(path)) continue
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>
    const pids = name === '.panel.lock' ? [data.pid] : Object.values(data)
    for (const pid of pids) {
      if (!Number.isInteger(pid) || pid < 1) throw new PanelError('Invalid process registry. Inspect it before migrating data.')
      let alive = true
      try { process.kill(pid, 0) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false }
      if (alive) throw new PanelError('Stop the panel and managed servers before migrating their data directory.')
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
