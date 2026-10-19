import { Pool } from 'pg'

let pool: Pool | null = null
let ready = false

export function databaseUrl(): string | null {
  return process.env.PANEL_DATABASE_URL || process.env.DATABASE_URL || null
}

export function hasDatabase(): boolean { return Boolean(databaseUrl()) }

export async function initDatabase(): Promise<void> {
  const url = databaseUrl()
  if (!url) { ready = false; return }
  pool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30000 })
  pool.on('error', () => { /* keep pool alive */ })
  const client = await pool.connect()
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
    ready = true
  } finally { client.release() }
}

export function isDatabaseReady(): boolean { return ready && pool !== null }

export async function readDoc<T>(key: string, fallback: T): Promise<T> {
  if (!pool || !ready) return fallback
  try {
    const r = await pool.query('SELECT data FROM documents WHERE key = $1', [key])
    if (r.rows.length === 0) return fallback
    return r.rows[0].data as T
  } catch { return fallback }
}

export async function saveDoc(key: string, value: unknown): Promise<void> {
  if (!pool || !ready) return
  try {
    await pool.query(
      `INSERT INTO documents (key, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [key, JSON.stringify(value)])
  } catch { /* ignore */ }
}

export async function closeDatabase(): Promise<void> {
  if (pool) { await pool.end(); pool = null; ready = false }
}
