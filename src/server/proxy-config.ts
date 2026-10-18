import { readText } from './files'
import { parse as parseToml } from 'smol-toml'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validAddress(value: unknown) {
  const match = typeof value === 'string' ? value.match(/^(?:\[[0-9a-f:]+\]|[^\s:]+):(\d+)$/iu) : undefined
  return Boolean(match && Number(match[1]) >= 1 && Number(match[1]) <= 65535)
}

export function velocityStartupIssue(directory: string): string | undefined {
  let config: unknown
  try { config = parseToml(readText(directory, 'velocity.toml')) }
  catch { return 'Velocity velocity.toml could not be read or contains invalid TOML. Fix it in Files before starting.' }
  if (!record(config) || !record(config.servers)) return 'Configure at least one backend in the [servers] table in velocity.toml.'
  const servers = config.servers
  const names = Object.keys(servers).filter((name) => name !== 'try')
  if (!names.length) return 'Configure at least one backend in the [servers] table in velocity.toml.'
  for (const name of names) if (!validAddress(servers[name])) return `Backend "${name}" needs a valid host:port address in velocity.toml.`
  if (!Array.isArray(servers.try) || !servers.try.length || servers.try.some((name) => typeof name !== 'string' || !names.includes(name))) return 'The servers.try list in velocity.toml must contain existing backend names.'
  const hosts = config['forced-hosts']
  if (!record(hosts)) return 'Add an explicit [forced-hosts] table to velocity.toml, empty if unused, to prevent Velocity from supplying example host mappings.'
  for (const [host, targets] of Object.entries(hosts)) {
    const values = typeof targets === 'string' ? [targets] : targets
    if (!Array.isArray(values) || !values.length || values.some((name) => typeof name !== 'string' || !names.includes(name))) return `Forced host "${host}" in velocity.toml references a backend that is not defined in [servers].`
  }
}

export function proxyStartupIssue(kind: 'velocity' | 'paper', directory: string) {
  return kind === 'velocity' ? velocityStartupIssue(directory) : undefined
}

/** Reads the backend map and fallback order back out of velocity.toml, for a live [servers] update. */
export function readProxyTopology(directory: string): { order: string[]; servers: [string, string][] } | undefined {
  let config: unknown
  try { config = parseToml(readText(directory, 'velocity.toml')) } catch { return }
  if (!record(config) || !record(config.servers)) return
  const servers: [string, string][] = []
  for (const [name, address] of Object.entries(config.servers)) if (name !== 'try' && typeof address === 'string' && validAddress(address)) servers.push([name, address])
  const order = Array.isArray(config.servers.try) ? (config.servers.try as unknown[]).filter((name): name is string => typeof name === 'string' && servers.some(([id]) => id === name)) : []
  return servers.length ? { order, servers } : undefined
}
