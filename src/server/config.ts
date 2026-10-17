import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Server } from '../types'
import { PanelError } from './errors'

export type ServerConfig = Omit<Server, 'installed' | 'jarVersion' | 'download' | 'eulaAccepted' | 'status' | 'memory' | 'players' | 'cpu' | 'logs' | 'logOffset'>
export const javaVersions = ['Java 25', 'Java 21', 'Java 17']

export function proxyConfig(kind: 'velocity' | 'bungeecord'): ServerConfig {
  return {
    id: 'proxy', name: 'Proxy', kind, address: '127.0.0.1:25565', javaVersion: 'Java 21',
    jarFile: kind === 'velocity' ? 'velocity.jar' : 'bungeecord.jar',
    startupCommand: 'java -Xms{{MIN_MEMORY}}M -Xmx{{MAX_MEMORY}}M -jar {{JAR_FILE}}',
    minMemory: 256, maxMemory: 1024, workingDirectory: 'servers/proxy',
    stopCommand: kind === 'velocity' ? 'shutdown' : 'end', autoStart: true, restartOnCrash: true,
  }
}

export function validateRelativePath(path: string, allowEmpty = false) {
  if (typeof path !== 'string' || (!path && !allowEmpty) || path.length > 1024 || path.startsWith('/') || path.includes('\\') || [...path].some((character) => character.charCodeAt(0) < 32) || (path && path.split('/').some((part) => !part || part === '.' || part === '..'))) throw new PanelError('Invalid relative path.')
}

export function validateConfig(value: ServerConfig) {
  if (!value || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id) || !['velocity', 'bungeecord', 'paper'].includes(value.kind)) throw new PanelError('Invalid server configuration.')
  for (const field of ['name', 'address', 'jarFile', 'workingDirectory', 'startupCommand', 'stopCommand'] as const) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 4096 || /[\r\n\0]/u.test(value[field])) throw new PanelError(`Invalid ${field}.`)
  }
  if (!/^127\.0\.0\.1:\d+$/.test(value.address) || Number(value.address.split(':')[1]) < 1024 || Number(value.address.split(':')[1]) > 65535) throw new PanelError('Use a loopback address with a port from 1024 to 65535.')
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
  validateNetwork(data.servers)
  return data.servers
}
