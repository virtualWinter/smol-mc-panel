import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { databaseUrl, deleteDoc, initDatabase, isDatabaseReady, listDocKeys, readDoc, saveDoc } from './db'
import { PanelError } from './errors'

// Postgres is the store for panel-owned data. The data directory only keeps
// runtime artifacts (server files, jars, worlds, sockets, locks) plus a local
// recovery copy if a database write ever fails.
const PANEL_JSON_FILES = new Set([
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
const PANEL_TEXT_FILES = new Set(['forwarding.secret'])
const PANEL_DIRS = [
  'agents/',
  'installations/',
  'permission-clients/',
  'permission-groups/',
  'permission-plugin/',
  'permission-servers/',
  'player-sync/',
  'plugin-installations/',
]

export function isPanelKey(key: string): boolean {
  return PANEL_JSON_FILES.has(key) || PANEL_TEXT_FILES.has(key) || PANEL_DIRS.some((dir) => key.startsWith(dir))
}

const memory = new Map<string, unknown>()
const pending = new Set<Promise<unknown>>()
let dataRoot: string | null = null
let loaded = false
let bootstrap: Promise<void> | null = null

export function setDataRoot(root: string) { dataRoot = root }

function panelKeyFor(path: string): string | null {
  if (!dataRoot) return null
  const key = relative(dataRoot, path).split('\\').join('/')
  return key.startsWith('..') ? null : (isPanelKey(key) ? key : null)
}

function writeJsonFile(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}

function writeTextField(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, value, { mode: 0o600 })
}

function persist(key: string, path: string, value: unknown, text: boolean) {
  const task = saveDoc(key, value).then((ok) => {
    // Keep a recovery copy only when Postgres refused the write; the next
    // startup migrates it back and removes the file.
    if (!ok) {
      if (text) writeTextField(path, String(value))
      else writeJsonFile(path, value)
    }
  })
  pending.add(task)
  void task.finally(() => pending.delete(task))
}

// Awaits writes started by saveJson before the process exits.
export async function flushPanelWrites(): Promise<void> {
  await Promise.allSettled([...pending])
}

// Panel documents are served from the in-memory cache; other files read normally.
export function readPanelJson<T>(path: string, fallback: T): T {
  const key = panelKeyFor(path)
  if (key && loaded) return memory.has(key) ? memory.get(key) as T : fallback
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : fallback
}

export function writePanelJson(path: string, value: unknown): void {
  const key = panelKeyFor(path)
  if (key && loaded) { memory.set(key, value); persist(key, path, value, false); return }
  writeJsonFile(path, value)
}

export function readPanelText(path: string, fallback: string): string {
  const key = panelKeyFor(path)
  if (key && loaded) {
    const value = memory.get(key)
    return typeof value === 'string' ? value : fallback
  }
  return existsSync(path) ? readFileSync(path, 'utf8') : fallback
}

export function writePanelText(path: string, value: string): void {
  const key = panelKeyFor(path)
  if (key && loaded) { memory.set(key, value); persist(key, path, value, true); return }
  writeTextField(path, value)
}

interface PanelFile { path: string; key: string; text: boolean }

function collectPanelFiles(root: string): PanelFile[] {
  const files: PanelFile[] = []
  for (const name of PANEL_JSON_FILES) files.push({ path: resolve(root, name), key: name, text: false })
  for (const name of PANEL_TEXT_FILES) files.push({ path: resolve(root, name), key: name, text: true })
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name.endsWith('.json')) {
        const key = relative(root, path).split('\\').join('/')
        if (isPanelKey(key)) files.push({ path, key, text: false })
      }
    }
  }
  for (const dir of PANEL_DIRS) walk(resolve(root, dir))
  return files.filter((file) => existsSync(file.path))
}

// One-time startup reconciliation. Moves panel documents into Postgres, loads
// them into memory, and removes the now-redundant files so the volume holds
// runtime data only. Runs before the network runtime is constructed.
export async function bootstrapStorage(root: string): Promise<void> {
  setDataRoot(root)
  if (bootstrap) return bootstrap
  bootstrap = (async () => {
    await initDatabase()
    if (!isDatabaseReady()) {
      // Without a configured database the panel keeps working from files.
      if (databaseUrl()) throw new PanelError('The configured database is unavailable; the panel cannot load its data.')
      loaded = false
      return
    }
    for (const key of await listDocKeys()) if (!isPanelKey(key)) await deleteDoc(key)
    const files = collectPanelFiles(root)
    for (const file of files) {
      let value: unknown
      try { value = file.text ? readFileSync(file.path, 'utf8') : JSON.parse(readFileSync(file.path, 'utf8')) }
      catch { throw new PanelError(`Cannot migrate ${file.key}: the file is not valid. Fix or remove it, then restart the panel.`) }
      if (!await saveDoc(file.key, value)) throw new PanelError('Database migration failed; no panel files were removed.')
      memory.set(file.key, value)
    }
    for (const key of await listDocKeys()) {
      if (!isPanelKey(key) || memory.has(key)) continue
      const value = await readDoc<unknown>(key, undefined)
      if (value !== undefined) memory.set(key, value)
    }
    for (const file of files) rmSync(file.path, { force: true })
    loaded = true
  })().catch((error) => { bootstrap = null; throw error })
  return bootstrap
}
