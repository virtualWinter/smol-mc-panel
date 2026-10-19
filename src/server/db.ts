import { Pool } from 'pg'

let pool: Pool | null = null
let ready = false

export function databaseUrl(): string | null {
  return process.env.PANEL_DATABASE_URL || process.env.DATABASE_URL || null
}

export function hasDatabase(): boolean { return Boolean(databaseUrl()) }

export function isDatabaseReady(): boolean { return ready && pool !== null }

// Creates the connection pool and the document table. Never throws: a bad or
// unreachable database degrades to file-only storage instead of taking the panel down.
export async function initDatabase(): Promise<void> {
  const url = databaseUrl()
  if (!url) { ready = false; return }
  let candidate: Pool | null = null
  try {
    candidate = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
    candidate.on('error', () => { /* keep the pool alive; failed queries fall back to files */ })
    await candidate.query(`CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
    pool = candidate
    ready = true
  } catch {
    ready = false
    if (candidate) await candidate.end().catch(() => undefined)
  }
}

export async function readDoc<T>(key: string, fallback: T): Promise<T> {
  if (!isDatabaseReady()) return fallback
  try {
    const result = await pool!.query('SELECT data FROM documents WHERE key = $1', [key])
    return result.rows.length ? result.rows[0].data as T : fallback
  } catch { return fallback }
}

export async function saveDoc(key: string, value: unknown): Promise<boolean> {
  if (!isDatabaseReady()) return false
  try {
    await pool!.query(
      `INSERT INTO documents (key, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [key, JSON.stringify(value)])
    return true
  } catch { return false /* the caller keeps a local recovery copy instead */ }
}

export async function deleteDoc(key: string): Promise<void> {
  if (!isDatabaseReady()) return
  try { await pool!.query('DELETE FROM documents WHERE key = $1', [key]) } catch { /* ignore */ }
}

export async function listDocKeys(): Promise<string[]> {
  if (!isDatabaseReady()) return []
  try {
    const result = await pool!.query('SELECT key FROM documents')
    return result.rows.map((row) => row.key as string)
  } catch { return [] }
}

export async function closeDatabase(): Promise<void> {
  const current = pool
  pool = null; ready = false
  if (current) await current.end().catch(() => undefined)
}
