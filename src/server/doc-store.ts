import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { deleteDoc, isDatabaseReady, listDocKeys, readDoc, saveDoc } from './db'

// The panel only persists its own JSON documents in Postgres. Minecraft's own
// files (world data, ops/whitelist, plugin configs) stay on disk under
// servers/, backups/, player-sync/ and java/, and are owned by the servers.
const PANEL_FILES = new Set([
  'admin.json',
  'backup-schedules.json',
  'group-order.json',
  'known-players.json',
  'minecraft-versions.json',
  'panel.json',
  'permissions.json',
  'player-policy.json',
  'proxy-versions.json',
])
const PANEL_DIRS = [
  'agents/',
  'installations/',
  'permission-clients/',
  'permission-groups/',
  'permission-plugin/',
  'permission-servers/',
  'plugin-installations/',
]

export function isPanelKey(key: string): boolean {
  return PANEL_FILES.has(key) || PANEL_DIRS.some((dir) => key.startsWith(dir))
}

let dataRoot: string | null = null

export function setDataRoot(root: string) { dataRoot = root }

// Maps an absolute file path to its document key, or null when the file is not
// panel-owned (and therefore must never be mirrored to Postgres).
function documentKey(path: string): string | null {
  if (!dataRoot) return null
  const key = relative(dataRoot, path).split('\\').join('/')
  return key.startsWith('..') ? null : (isPanelKey(key) ? key : null)
}

// Fire-and-forget mirror of a panel write. Failures are swallowed inside db.ts.
export function mirrorToDatabase(path: string, value: unknown): void {
  const key = documentKey(path)
  if (key && isDatabaseReady()) void saveDoc(key, value)
}

function writeJsonFile(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
}

// Reconciles Postgres and the data directory on startup:
//  - drops rows that used to be migrated but aren't panel-owned,
//  - pushes every panel-owned file to Postgres (the on-disk file is always the
//    most recent write, since the panel writes files synchronously first),
//  - materializes panel-owned documents that only exist in Postgres (fresh volume).
export async function migrateStorage(root: string): Promise<void> {
  setDataRoot(root)
  if (!isDatabaseReady()) return
  const existing = new Set(await listDocKeys())
  for (const key of existing) if (!isPanelKey(key)) await deleteDoc(key)
  const files: string[] = []
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.json')) files.push(path)
    }
  }
  for (const name of PANEL_FILES) files.push(resolve(root, name))
  for (const dir of PANEL_DIRS) walk(resolve(root, dir))
  for (const file of files) {
    if (!existsSync(file)) continue
    const key = relative(root, file).split('\\').join('/')
    if (!isPanelKey(key)) continue
    try { await saveDoc(key, JSON.parse(readFileSync(file, 'utf8'))) } catch { /* skip unreadable or invalid files */ }
  }
  for (const key of await listDocKeys()) {
    if (!isPanelKey(key) || existsSync(resolve(root, key))) continue
    const value = await readDoc<unknown>(key, undefined)
    if (value !== undefined) writeJsonFile(resolve(root, key), value)
  }
}
