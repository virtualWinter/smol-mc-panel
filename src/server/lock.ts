import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PanelError } from './errors'
import { processAlive, processStart, registration } from './liveness'

export function acquireLock(root: string) {
  const path = resolve(root, '.panel.lock')
  if (existsSync(path)) {
    let data: unknown
    try { data = JSON.parse(readFileSync(path, 'utf8')) } catch { data = undefined }
    const holder = registration(data)
    if (!holder) throw new PanelError('Invalid panel lock. Inspect .panel.lock before removing it.')
    if (processAlive(holder.pid, holder.start)) throw new PanelError('Another panel process is already managing this network.')
    unlinkSync(path)
  }
  const content = JSON.stringify({ pid: process.pid, start: processStart(process.pid), token: randomUUID() })
  writeFileSync(path, content, { flag: 'wx', mode: 0o600 })
  return () => { if (existsSync(path) && readFileSync(path, 'utf8') === content) unlinkSync(path) }
}
