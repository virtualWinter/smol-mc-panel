'use server'

import { randomUUID } from 'node:crypto'
import { directoryExists, findServer, state, validatePath } from './store'
import type { Server } from '../types'

export async function powerServer(id: string, action: 'Start' | 'Restart' | 'Stop') {
  if (!['Start', 'Restart', 'Stop'].includes(action)) throw new Error('Invalid action')
  const server = findServer(id)
  server.status = action === 'Stop' ? 'Offline' : 'Online'
  server.logs.push(`[MOCK] ${action} requested.`, `[MOCK] Server ${action === 'Stop' ? 'stopped' : 'started'}.`)
}

export async function sendCommand(id: string, command: string) {
  const server = findServer(id)
  if (typeof command !== 'string' || !command.trim() || command.length > 4096) throw new Error('Invalid command')
  server.logs.push(`> ${command.trim()}`, '[MOCK] Command received; no backend connected.')
}

export async function saveSettings(id: string, input: Partial<Server>) {
  const server = findServer(id)
  for (const key of ['name', 'address', 'javaVersion', 'jarFile', 'startupCommand', 'workingDirectory', 'stopCommand'] as const) {
    if (typeof input[key] !== 'string' || !input[key]!.trim() || input[key]!.length > 4096) throw new Error('Invalid setting')
  }
  const min = Number(input.minMemory), max = Number(input.maxMemory)
  if (!state.javaVersions.includes(input.javaVersion!)) throw new Error('Unsupported Java version')
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 128 || max < min || max > 1048576 || typeof input.restartOnCrash !== 'boolean') throw new Error('Invalid memory or restart settings')
  for (const key of ['name', 'address', 'javaVersion', 'jarFile', 'startupCommand', 'workingDirectory', 'stopCommand'] as const) server[key] = input[key]!.trim()
  Object.assign(server, { minMemory: min, maxMemory: max, restartOnCrash: input.restartOnCrash })
}

export async function reorderServers(activeId: string, overId: string) {
  findServer(activeId); findServer(overId)
  const from = state.servers.findIndex((server) => server.id === activeId)
  const to = state.servers.findIndex((server) => server.id === overId)
  const [moved] = state.servers.splice(from, 1)
  state.servers.splice(to, 0, moved)
}

export async function moveFile(id: string, source: string, destination: string) {
  directoryExists(id, destination)
  validatePath(source)
  const entry = state.files[id].find((file) => file.path === source)
  if (!entry) throw new Error('File not found')
  const next = [destination, entry.name].filter(Boolean).join('/')
  if (next === source) return
  if (destination === source || destination.startsWith(`${source}/`)) throw new Error('A folder cannot be moved into itself')
  if (state.files[id].some((file) => file.path === next)) throw new Error('Name already exists')
  for (const file of state.files[id]) if (file.path === source || file.path.startsWith(`${source}/`)) file.path = next + file.path.slice(source.length)
}

export async function uploadFiles(id: string, destination: string, data: FormData) {
  directoryExists(id, destination)
  const files = data.getAll('files')
  if (!files.length || files.length > 50) throw new Error('Invalid upload')
  for (const file of files) if (!(file instanceof File) || file.size > 512 * 1024) throw new Error('Preview upload limit: 512 KiB per file')
  for (const file of files as File[]) {
    const name = file.name
    validatePath(name)
    if (!name || name.includes('/')) throw new Error('Invalid filename')
    let unique = name, suffix = 1
    const path = () => [destination, unique].filter(Boolean).join('/')
    while (state.files[id].some((entry) => entry.path === path())) unique = `${name} (${suffix++})`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const binary = name.endsWith('.jar') || bytes.includes(0)
    state.files[id].push({ name: unique, path: path(), size: `${file.size} B`, modified: new Date().toISOString(), binary, content: binary ? undefined : new TextDecoder().decode(bytes) })
  }
}

export async function saveFile(id: string, path: string, content: string) {
  findServer(id); validatePath(path)
  const file = state.files[id].find((entry) => entry.path === path)
  if (!file || file.directory || file.binary || typeof content !== 'string' || content.length > 512 * 1024) throw new Error('Cannot edit file')
  Object.assign(file, { content, size: `${new TextEncoder().encode(content).length} B`, modified: new Date().toISOString() })
}

export async function createBackup(id: string) {
  findServer(id)
  state.backups[id].push({ id: randomUUID(), name: 'Manual backup', created: new Date().toISOString(), size: '0 B (mock)' })
}
export async function deleteBackup(id: string, backupId: string) {
  findServer(id)
  state.backups[id] = state.backups[id].filter((backup) => backup.id !== backupId)
}
