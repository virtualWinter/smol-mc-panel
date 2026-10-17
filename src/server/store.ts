import 'server-only'
import { networkServers, serverFiles, serverBackups, metricHistory, javaVersions } from './mockData'
import type { PanelState } from '../types'

const globalStore = globalThis as typeof globalThis & { panelState?: PanelState }
export const state = globalStore.panelState ??= {
  servers: structuredClone(networkServers),
  files: Object.fromEntries(Object.entries(serverFiles).map(([id, files]) => [id, files.map((file) => ({ ...file, path: file.name, binary: file.name.endsWith('.jar') }))])),
  backups: structuredClone(serverBackups),
  metrics: structuredClone(metricHistory),
  javaVersions,
}
state.javaVersions ??= javaVersions

export function snapshot(): PanelState { return structuredClone(state) }
export function findServer(id: string) {
  const server = state.servers.find((item) => item.id === id)
  if (!server) throw new Error('Server not found')
  return server
}
export function validatePath(path: string) {
  if (typeof path !== 'string' || path.length > 1024 || path.includes('\\') || path.includes('\0') || path.startsWith('/') || path.split('/').some((part) => part === '..' || part === '.')) throw new Error('Invalid path')
}
export function directoryExists(id: string, path: string) {
  findServer(id)
  validatePath(path)
  if (path && !state.files[id].some((file) => file.path === path && file.directory)) throw new Error('Directory not found')
}
