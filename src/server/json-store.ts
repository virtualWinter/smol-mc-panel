import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mirrorToDatabase } from './doc-store'

export function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : fallback
}

export function saveJson(path: string, value: unknown) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
  // Keep the Postgres copy in sync (no-op for non-panel files and when unconfigured).
  mirrorToDatabase(path, value)
}
