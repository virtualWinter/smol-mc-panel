import { readPanelJson, writePanelJson } from './doc-store'

// Panel-owned paths are stored in Postgres (cached in memory); everything else
// (server files, idempotent runtime state) is read from and written to disk.
export function readJson<T>(path: string, fallback: T): T {
  return readPanelJson(path, fallback)
}

export function saveJson(path: string, value: unknown) {
  writePanelJson(path, value)
}
