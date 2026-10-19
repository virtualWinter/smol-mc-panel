import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Server, SetupServerInput } from '../types'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { rewriteProxyBind } from './provision'

export type ServerConfig = Omit<Server, 'installed' | 'jarVersion' | 'minecraftVersion' | 'proxyVersion' | 'download' | 'startupIssue' | 'telemetry' | 'eulaAccepted' | 'permissionPlugin' | 'status' | 'memory' | 'players' | 'cpu' | 'logs' | 'logOffset'>
export const javaVersions = ['Java 25', 'Java 21', 'Java 17']

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const serverDirectoryName = (uuid: string) => `servers/${uuid}`

/** Stable UUID for servers created before UUID directories existed.
 *
 * Deriving it from the ID keeps retries safe: if a directory was moved but panel.json was not saved,
 * the next boot finds the same destination instead of orphaning the server files under a new name. */
export function legacyServerUuid(id: string) {
  const hex = createHash('sha256').update(`smol-mc-panel/server/${id}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function proxyConfig(): ServerConfig {
  const uuid = randomUUID()
  return {
    uuid, id: 'proxy', name: 'Proxy', kind: 'velocity', address: '0.0.0.0:25565', javaVersion: 'Java 21',
    jarFile: 'velocity.jar',
    startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}}',
    minMemory: 256, maxMemory: 1024, workingDirectory: serverDirectoryName(uuid),
    stopCommand: 'shutdown', autoStart: true, restartOnCrash: true,
  }
}

export function setupNetwork(backends: SetupServerInput[]): ServerConfig[] {
  if (!Array.isArray(backends) || backends.length < 1 || backends.length > 20) throw new PanelError('Add between 1 and 20 Paper servers during setup.')
  const servers: ServerConfig[] = [proxyConfig(), ...backends.map((input): ServerConfig => {
    if (!input || typeof input.id !== 'string' || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || !Number.isInteger(input.port) || !Number.isInteger(input.maxMemory)) throw new PanelError('Each server needs a valid ID, name, port, and memory limit.')
    const uuid = randomUUID()
    return {
      uuid, id: input.id.trim(), name: input.name.trim(), kind: 'paper', address: `127.0.0.1:${input.port}`,
      workingDirectory: serverDirectoryName(uuid), javaVersion: input.javaVersion,
      jarFile: 'server.jar', startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}} nogui',
      minMemory: 256, maxMemory: input.maxMemory, stopCommand: 'stop', autoStart: true, restartOnCrash: true,
      ...(input.group ? { group: String(input.group).trim().slice(0, 32) } : {}),
    }
  })]
  validateNetwork(servers)
  return servers
}

export function validateRelativePath(path: string, allowEmpty = false) {
  if (typeof path !== 'string' || (!path && !allowEmpty) || path.length > 1024 || path.startsWith('/') || path.includes('\\') || [...path].some((character) => character.charCodeAt(0) < 32) || (path && path.split('/').some((part) => !part || part === '.' || part === '..'))) throw new PanelError('Invalid relative path.')
}

export function validateConfig(value: ServerConfig) {
  if (!value || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id) || !['velocity', 'paper'].includes(value.kind)) throw new PanelError('Invalid server configuration.')
  if (typeof value.uuid !== 'string' || !uuidPattern.test(value.uuid)) throw new PanelError('Invalid server UUID.')
  for (const field of ['name', 'address', 'jarFile', 'workingDirectory', 'startupCommand', 'stopCommand'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 4096 || /[\r\n\0]/u.test(value[field])) throw new PanelError(`Invalid ${field}.`)
  }
  const loopback = /^127\.0\.0\.1:\d+$/.test(value.address)
  if (!(value.kind === 'paper' ? loopback : /^0\.0\.0\.0:\d+$/.test(value.address)) || Number(value.address.split(':')[1]) < 1024 || Number(value.address.split(':')[1]) > 65535) throw new PanelError(value.kind === 'paper' ? 'Use a loopback address with a port from 1024 to 65535.' : 'The proxy must bind every interface (0.0.0.0) with a port from 1024 to 65535.')
  validateRelativePath(value.jarFile)
  if (value.workingDirectory !== serverDirectoryName(value.uuid)) throw new PanelError('The server directory must be named after its UUID.')
  validateRelativePath(value.workingDirectory)
  if (!javaVersions.includes(value.javaVersion)) throw new PanelError('Unsupported Java version.')
  if (!Number.isInteger(value.minMemory) || !Number.isInteger(value.maxMemory) || value.minMemory < 128 || value.maxMemory < value.minMemory || value.maxMemory > 1048576) throw new PanelError('Invalid memory limits.')
  if (typeof value.restartOnCrash !== 'boolean' || value.autoStart !== true) throw new PanelError('Invalid automation settings.')
}

export function validateNetwork(servers: ServerConfig[]) {
  if (!Array.isArray(servers) || !servers.length || servers.length > 100 || servers.filter((server) => server.kind !== 'paper').length !== 1) throw new PanelError('The network must contain exactly one proxy.')
  servers.forEach(validateConfig)
  for (const key of ['id', 'uuid', 'address', 'workingDirectory'] as const) if (new Set(servers.map((server) => server[key])).size !== servers.length) throw new PanelError(`Duplicate ${key}.`)
  const proxy = servers.find((server) => server.kind !== 'paper')!
  for (const server of servers) if (server.kind === 'paper' && server.address.split(':')[1] === proxy.address.split(':')[1]) throw new PanelError('Backend ports must differ from the proxy bind port.')
}

export function saveConfig(root: string, servers: ServerConfig[]) {
  validateNetwork(servers)
  saveJson(resolve(root, 'panel.json'), { version: 1, servers })
}

export function configExists(root: string): boolean {
  return readJson<unknown>(resolve(root, 'panel.json'), undefined) !== undefined
}

/** Gives every server a UUID and moves its files to `servers/<uuid>`.
 *
 * Servers created before UUID directories existed get a stable UUID derived from their ID, so a
 * partially completed migration can be retried without losing the moved directory. */
function migrateServerIdentity(root: string, server: ServerConfig): ServerConfig {
  const uuid = typeof server.uuid === 'string' && uuidPattern.test(server.uuid) ? server.uuid : legacyServerUuid(server.id)
  const target = serverDirectoryName(uuid)
  if (server.uuid === uuid && server.workingDirectory === target) return server
  const source = typeof server.workingDirectory === 'string' ? server.workingDirectory : ''
  if (source && source !== target) {
    validateRelativePath(source)
    const from = resolve(root, source)
    const to = resolve(root, target)
    if (existsSync(from)) {
      if (existsSync(to)) throw new PanelError(`Cannot migrate ${server.id}: both ${source} and ${target} exist.`)
      mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
      renameSync(from, to)
    }
  }
  return { ...server, uuid, workingDirectory: target }
}

export function loadConfig(root: string): ServerConfig[] {
  const data = readJson<{ version: number; servers: ServerConfig[] } | undefined>(resolve(root, 'panel.json'), undefined)
  if (!data) throw new PanelError('Complete the first-start setup before starting the network.')
  if (data.version !== 1) throw new PanelError('Unsupported network configuration version.')
  if (data.servers.some((server) => (server.kind as string) === 'bungeecord')) throw new PanelError('BungeeCord support was removed. Restore a backup or set up a Velocity network.')
  const servers = data.servers.map((server) => {
    let migrated = server
    // The proxy moved to a public bind; migrate loopback-era panel.json files on first load.
    if (migrated.kind !== 'paper' && !/^0\.0\.0\.0:\d+$/.test(migrated.address)) {
      if (typeof migrated.address !== 'string' || !/^127\.0\.0\.1:\d+$/.test(migrated.address)) throw new PanelError(`Invalid proxy address for ${migrated.id}.`)
      migrated = { ...migrated, address: `0.0.0.0:${migrated.address.split(':')[1]}` }
    }
    return migrateServerIdentity(root, migrated)
  })
  validateNetwork(servers)
  for (const server of servers) {
    if (server.kind === 'paper' || data.servers.find((original) => original.id === server.id)?.address === server.address) continue
    rewriteProxyBind(root, server)
  }
  if (JSON.stringify(data.servers) !== JSON.stringify(servers)) saveConfig(root, servers)
  return servers
}
