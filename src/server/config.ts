import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Server, SetupServerInput } from '../types'
import { PanelError } from './errors'
import { rewriteProxyBind } from './provision'

export type ServerConfig = Omit<Server, 'installed' | 'jarVersion' | 'download' | 'startupIssue' | 'telemetry' | 'eulaAccepted' | 'status' | 'memory' | 'players' | 'cpu' | 'logs' | 'logOffset'>
export const javaVersions = ['Java 25', 'Java 21', 'Java 17']

export function proxyConfig(): ServerConfig {
  return {
    id: 'proxy', name: 'Proxy', kind: 'velocity', address: '0.0.0.0:25565', javaVersion: 'Java 21',
    jarFile: 'velocity.jar',
    startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}}',
    minMemory: 256, maxMemory: 1024, workingDirectory: 'servers/proxy',
    stopCommand: 'shutdown', autoStart: true, restartOnCrash: true,
  }
}

export function setupNetwork(backends: SetupServerInput[]): ServerConfig[] {
  if (!Array.isArray(backends) || backends.length < 1 || backends.length > 20) throw new PanelError('Add between 1 and 20 Paper servers during setup.')
  const servers: ServerConfig[] = [proxyConfig(), ...backends.map((input): ServerConfig => {
    if (!input || typeof input.id !== 'string' || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || !Number.isInteger(input.port) || !Number.isInteger(input.maxMemory)) throw new PanelError('Each server needs a valid ID, name, port, and memory limit.')
    return {
      id: input.id.trim(), name: input.name.trim(), kind: 'paper', address: `127.0.0.1:${input.port}`,
      workingDirectory: `servers/${input.id.trim()}`, javaVersion: input.javaVersion,
      jarFile: 'server.jar', startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}} nogui',
      minMemory: 256, maxMemory: input.maxMemory, stopCommand: 'stop', autoStart: true, restartOnCrash: true,
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
  for (const field of ['name', 'address', 'jarFile', 'workingDirectory', 'startupCommand', 'stopCommand'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 4096 || /[\r\n\0]/u.test(value[field])) throw new PanelError(`Invalid ${field}.`)
  }
  const loopback = /^127\.0\.0\.1:\d+$/.test(value.address)
  if (!(value.kind === 'paper' ? loopback : /^0\.0\.0\.0:\d+$/.test(value.address)) || Number(value.address.split(':')[1]) < 1024 || Number(value.address.split(':')[1]) > 65535) throw new PanelError(value.kind === 'paper' ? 'Use a loopback address with a port from 1024 to 65535.' : 'The proxy must bind every interface (0.0.0.0) with a port from 1024 to 65535.')
  validateRelativePath(value.jarFile)
  validateRelativePath(value.workingDirectory)
  if (!javaVersions.includes(value.javaVersion)) throw new PanelError('Unsupported Java version.')
  if (!Number.isInteger(value.minMemory) || !Number.isInteger(value.maxMemory) || value.minMemory < 128 || value.maxMemory < value.minMemory || value.maxMemory > 1048576) throw new PanelError('Invalid memory limits.')
  if (typeof value.restartOnCrash !== 'boolean' || value.autoStart !== true) throw new PanelError('Invalid automation settings.')
}

export function validateNetwork(servers: ServerConfig[]) {
  if (!Array.isArray(servers) || !servers.length || servers.length > 100 || servers.filter((server) => server.kind !== 'paper').length !== 1) throw new PanelError('The network must contain exactly one proxy.')
  servers.forEach(validateConfig)
  for (const key of ['id', 'address', 'workingDirectory'] as const) if (new Set(servers.map((server) => server[key])).size !== servers.length) throw new PanelError(`Duplicate ${key}.`)
  const proxy = servers.find((server) => server.kind !== 'paper')!
  for (const server of servers) if (server.kind === 'paper' && server.address.split(':')[1] === proxy.address.split(':')[1]) throw new PanelError('Backend ports must differ from the proxy bind port.')
}

export function saveConfig(root: string, servers: ServerConfig[]) {
  validateNetwork(servers)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const path = resolve(root, 'panel.json')
  writeFileSync(`${path}.tmp`, JSON.stringify({ version: 1, servers }, null, 2), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}

export function loadConfig(root: string): ServerConfig[] {
  const path = resolve(root, 'panel.json')
  if (!existsSync(path)) throw new PanelError('Complete the first-start setup before starting the network.')
  const data = JSON.parse(readFileSync(path, 'utf8')) as { version: number; servers: ServerConfig[] }
  if (data.version !== 1) throw new PanelError('Unsupported network configuration version.')
  if (data.servers.some((server) => (server.kind as string) === 'bungeecord')) throw new PanelError('BungeeCord support was removed. Restore a backup or set up a Velocity network.')
  // The proxy moved to a public bind; migrate loopback-era panel.json files on first load.
  const servers = data.servers.map((server) => {
    if (server.kind === 'paper' || /^0\.0\.0\.0:\d+$/.test(server.address)) return server
    if (typeof server.address !== 'string' || !/^127\.0\.0\.1:\d+$/.test(server.address)) throw new PanelError(`Invalid proxy address for ${server.id}.`)
    return { ...server, address: `0.0.0.0:${server.address.split(':')[1]}` }
  })
  validateNetwork(servers)
  for (const server of servers) {
    if (server.kind === 'paper' || data.servers.find((original) => original.id === server.id)?.address === server.address) continue
    rewriteProxyBind(root, server)
  }
  if (JSON.stringify(data.servers) !== JSON.stringify(servers)) saveConfig(root, servers)
  return servers
}
