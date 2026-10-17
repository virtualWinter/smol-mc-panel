import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PanelError } from './errors'

export function acquireLock(root: string) {
  const path = resolve(root, '.panel.lock')
  if (existsSync(path)) {
    const lock = JSON.parse(readFileSync(path, 'utf8')) as { pid: number }
    if (!Number.isInteger(lock.pid) || lock.pid < 1) throw new PanelError('Invalid panel lock. Inspect .panel.lock before removing it.')
    let alive = true
    try { process.kill(lock.pid, 0) } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false
    }
    if (alive) throw new PanelError('Another panel process is already managing this network.')
    unlinkSync(path)
  }
  const content = JSON.stringify({ pid: process.pid, token: randomUUID() })
  writeFileSync(path, content, { flag: 'wx', mode: 0o600 })
  return () => { if (existsSync(path) && readFileSync(path, 'utf8') === content) unlinkSync(path) }
}
