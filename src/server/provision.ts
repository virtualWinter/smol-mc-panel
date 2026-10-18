import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { ServerConfig } from './config'
import { serverDirectory } from './paths'

const writeNew = (path: string, content: string) => { if (!existsSync(path)) writeFileSync(path, content, { flag: 'wx', mode: 0o600 }) }

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Replaces the file atomically, only when the content actually changes. */
function syncFile(file: string, text: string, updated: string) {
  if (updated === text) return
  writeFileSync(`${file}.tmp`, updated, { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

/** Points the existing proxy bind at a new address without touching any other line. */
export function rewriteProxyBind(root: string, proxy: ServerConfig) {
  const file = resolve(serverDirectory(root, proxy.workingDirectory), 'velocity.toml')
  if (!existsSync(file)) return
  const pattern = /^([ \t]*bind[ \t]*=[ \t]*)("[^"]*"|'[^']*'|[^"'\n]*)/m
  const text = readFileSync(file, 'utf8')
  const updated = text.replace(pattern, (_match, lead: string, value: string) => {
    if (typeof value !== 'string') value = lead
    const quote = value.startsWith('"') || value.startsWith("'") ? value[0] : ''
    return `${lead}${quote}${proxy.address}${quote}`
  })
  if (updated !== text) { writeFileSync(`${file}.tmp`, updated, { mode: 0o600 }); renameSync(`${file}.tmp`, file) }
}

/** Rewrites one [section] header and its body (up to the next section header), leaving all other lines intact. */
function setSection(text: string, header: string, body: string) {
  const span = text.match(new RegExp(`^[ \\t]*\\[${header}\\][ \\t]*$`, 'mu'))
  const section = `[${header}]\n${body}${body ? '\n' : ''}`
  if (!span) return text.replace(/\s*$/u, '') + '\n\n' + section
  const after = text.indexOf('\n', span.index!) + 1
  const next = text.slice(after).search(/^[ \t]*\[[^\]]+\][ \t]*$/mu)
  return text.slice(0, span.index!) + section + text.slice(next === -1 ? text.length : after + next)
}

/** Rewrites one inline `key = {...}` value line, leaving all other lines intact. */
function setInlineKey(text: string, key: string, value: string) {
  const line = text.match(new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'mu'))
  if (!line) return setSection(text, key, '')
  return text.slice(0, line.index!) + `${key} = ${value}` + text.slice(line.index! + line[0].length)
}

/** Keeps the proxy's backend list identical to panel.json, so topology edits never need manual file edits.
 *
 * Only the `[servers]` table and `forced-hosts` are rewritten (from panel.json, the authoritative list);
 * everything else — comments, `[advanced]`, passthrough settings — is preserved byte-for-byte. User files
 * that fail to parse are left untouched; startup validation reports them. */
export function syncProxyServers(root: string, proxy: ServerConfig, backends: ServerConfig[]) {
  const file = resolve(serverDirectory(root, proxy.workingDirectory), 'velocity.toml')
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  let config: unknown
  try { config = parseToml(text) } catch { return }
  if (!record(config) || !record(config.servers)) return
  const names = backends.map((backend) => backend.id)
  const desiredServers: Record<string, unknown> = Object.fromEntries(backends.map((backend) => [backend.id, backend.address]))
  // A try list still referencing live backends is kept verbatim; anything stale resets to the panel order.
  desiredServers.try = Array.isArray(config.servers.try) && (config.servers.try as unknown[]).every((name) => typeof name === 'string' && names.includes(name)) ? config.servers.try : names
  const desiredHosts: Record<string, unknown> = {}
  if (record(config['forced-hosts'])) {
    for (const [host, targets] of Object.entries(config['forced-hosts'])) {
      const valid = (Array.isArray(targets) ? targets : [targets]).filter((target) => typeof target === 'string' && names.includes(target))
      if (valid.length) desiredHosts[host] = valid
    }
  }
  const serverLines = Object.entries(desiredServers).filter(([key]) => key !== 'try').map(([id, address]) => `${id} = "${String(address)}"\n`)
  const serversBody = `${serverLines.join('')}try = ${JSON.stringify(desiredServers.try)}`
  const hostLines = Object.entries(desiredHosts).map(([host, targets]) => `${JSON.stringify(host)} = ${JSON.stringify(targets)}`).join('\n')
  let updated = setSection(text, 'servers', serversBody)
  if (record(config['forced-hosts']) && /^[ \t]*\[forced-hosts\][ \t]*$/mu.test(text)) updated = setSection(updated, 'forced-hosts', hostLines)
  else if (record(config['forced-hosts']) || Object.keys(desiredHosts).length) updated = setInlineKey(updated, 'forced-hosts', Object.keys(desiredHosts).length ? `{ ${Object.entries(desiredHosts).map(([host, targets]) => `${JSON.stringify(host)} = ${JSON.stringify(targets)}`).join(', ')} }` : '{}')
  let verified: unknown
  try { verified = parseToml(updated) } catch { return }
  if (!record(verified)) return
  // Semantic comparison against the original file: identical topology rewrites nothing, so comments never churn.
  if (JSON.stringify(config.servers) === JSON.stringify(desiredServers) && JSON.stringify(config['forced-hosts'] ?? null) === JSON.stringify(desiredHosts)) return
  syncFile(file, text, updated)
}

export function provisionNetwork(root: string, servers: ServerConfig[]) {
  const proxy = servers.find((server) => server.kind !== 'paper')!
  const secretPath = resolve(root, 'forwarding.secret')
  writeNew(secretPath, randomBytes(32).toString('hex'))
  const secret = readFileSync(secretPath, 'utf8').trim()
  const backends = servers.filter((server) => server.kind === 'paper')
  for (const server of servers) {
    const directory = serverDirectory(root, server.workingDirectory)
    mkdirSync(resolve(directory, 'plugins'), { recursive: true })
    if (server.kind === 'velocity') {
      writeNew(resolve(directory, 'forwarding.secret'), secret)
      writeNew(resolve(directory, 'velocity.toml'), `config-version = "2.8"\nbind = "${server.address}"\nmotd = "A Minecraft network"\nshow-max-players = 100\nonline-mode = true\nplayer-info-forwarding-mode = "modern"\nforwarding-secret-file = "forwarding.secret"\nping-passthrough = "DISABLED"\n\n[servers]\n${backends.map((backend) => `${backend.id} = "${backend.address}"`).join('\n')}\ntry = [${backends.length ? JSON.stringify(backends[0].id) : ''}]\n\n[forced-hosts]\n`)
    } else {
      writeNew(resolve(directory, 'eula.txt'), '# Review https://aka.ms/MinecraftEULA before accepting.\neula=false\n')
      writeNew(resolve(directory, 'server.properties'), `server-ip=127.0.0.1\nserver-port=${server.address.split(':')[1]}\nonline-mode=false\nenforce-secure-profile=false\nmax-players=20\nenable-status=true\nenable-query=false\nenable-rcon=false\ngamemode=${server.id === 'creative' ? 'creative' : 'survival'}\nmotd=${server.name}\n`)
      mkdirSync(resolve(directory, 'config'), { recursive: true })
      writeNew(resolve(directory, 'config/paper-global.yml'), `proxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: ${JSON.stringify(secret)}\n`)
    }
  }
  syncProxyServers(root, proxy, backends)
}
