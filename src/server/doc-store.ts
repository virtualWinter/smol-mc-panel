import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { readDoc, saveDoc, isDatabaseReady, initDatabase } from './db'

let dataRoot: string | null = null
export function setDataRoot(root: string) { dataRoot = root }

export function readJson<T>(path: string, fallback: T): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : fallback
}

export function saveJson(path: string, value: unknown) {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
  // Mirror to PG (fire and forget)
  if (dataRoot && isDatabaseReady()) {
    const key = relative(dataRoot, path).replace(/\\/g, '/')
    void saveDoc(key, value)
  }
}

// Async versions
export async function readDocAsync<T>(key: string, fallback: T, filePath?: string): Promise<T> {
  if (isDatabaseReady()) {
    const v = await readDoc<T>(key, undefined as T)
    if (v !== undefined) return v
  }
  if (filePath) return readJson(filePath, fallback)
  return fallback
}

export async function saveDocAsync(key: string, value: unknown, filePath?: string): Promise<void> {
  if (isDatabaseReady()) await saveDoc(key, value)
  if (filePath) saveJson(filePath, value)
}

// Migrate all JSON files between PG and disk.
export async function migrateStorage(root: string): Promise<void> {
  setDataRoot(root)
  if (!isDatabaseReady()) return
  // Collect all JSON files under root
  const files: string[] = []
  function walk(dir: string) {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const p = resolve(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.json')) files.push(p)
    }
  }
  walk(root)
  // For each file, sync with PG (PG wins if it has data)
  for (const file of files) {
    const key = relative(root, file).replace(/\\/g, '/')
    const pgData = await readDoc<unknown>(key, undefined as unknown)
    if (pgData !== undefined) {
      // PG has data → overwrite file
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      writeFileSync(file, JSON.stringify(pgData, null, 2) + '\n', { mode: 0o600 })
    } else {
      // File has data → save to PG
      try {
        const data = JSON.parse(readFileSync(file, 'utf8'))
        await saveDoc(key, data)
      } catch { /* skip invalid */ }
    }
  }
}
