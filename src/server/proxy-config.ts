import { parse } from 'yaml'
import { readText } from './files'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function bungeeStartupIssue(directory: string): string | undefined {
  let config: unknown
  try { config = parse(readText(directory, 'config.yml'), { maxAliasCount: 50, uniqueKeys: true, prettyErrors: false }) }
  catch { return 'BungeeCord config.yml could not be read or contains invalid YAML. Fix it in Files before starting.' }
  if (!record(config) || !record(config.servers) || !Object.keys(config.servers).length) return 'BungeeCord requires at least one backend. Add its address under servers and its name to listeners.priorities in config.yml. No backend servers are created automatically.'
  const servers = config.servers
  for (const [name, server] of Object.entries(servers)) {
    const address = record(server) && typeof server.address === 'string' ? server.address.match(/^(?:\[[0-9a-f:]+\]|[^\s:]+):(\d+)$/iu) : undefined
    if (!address || Number(address[1]) < 1 || Number(address[1]) > 65535) return `Backend "${name}" needs a valid host:port address in config.yml.`
  }
  if (!Array.isArray(config.listeners) || !config.listeners.length) return 'Add at least one listener with backend priorities in config.yml.'
  for (const listener of config.listeners) {
    if (!record(listener) || !Array.isArray(listener.priorities) || !listener.priorities.length || listener.priorities.some((name) => typeof name !== 'string' || !Object.hasOwn(servers, name))) return 'Each listener needs priorities containing existing backend names from servers in config.yml.'
  }
}
