import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ServerConfig } from './config'
import { serverDirectory } from './paths'

const writeNew = (path: string, content: string) => { if (!existsSync(path)) writeFileSync(path, content, { flag: 'wx', mode: 0o600 }) }

export function provisionNetwork(root: string, servers: ServerConfig[]) {
  const proxy = servers.find((server) => server.kind !== 'paper')!
  const secretPath = resolve(root, 'forwarding.secret')
  if (proxy.kind === 'velocity') writeNew(secretPath, randomBytes(32).toString('hex'))
  const secret = proxy.kind === 'velocity' ? readFileSync(secretPath, 'utf8').trim() : ''
  const backends = servers.filter((server) => server.kind === 'paper')
  for (const server of servers) {
    const directory = serverDirectory(root, server.workingDirectory)
    mkdirSync(resolve(directory, 'plugins'), { recursive: true })
    if (server.kind === 'velocity') {
      writeNew(resolve(directory, 'forwarding.secret'), secret)
      writeNew(resolve(directory, 'velocity.toml'), `config-version = "2.8"\nbind = "${server.address}"\nmotd = "A Minecraft network"\nshow-max-players = 100\nonline-mode = true\nplayer-info-forwarding-mode = "modern"\nforwarding-secret-file = "forwarding.secret"\nping-passthrough = "DISABLED"\n\n[servers]\n${backends.map((backend) => `${backend.id} = "${backend.address}"`).join('\n')}\ntry = [${backends.length ? JSON.stringify(backends[0].id) : ''}]\n\n[forced-hosts]\n`)
    } else if (server.kind === 'bungeecord') {
      writeNew(resolve(directory, 'config.yml'), `online_mode: true\nip_forward: true\nprevent_proxy_connections: false\nservers: ${backends.length ? '\n' + backends.map((backend) => `  ${backend.id}:\n    address: ${JSON.stringify(backend.address)}\n    motd: ${JSON.stringify(backend.name)}\n    restricted: false`).join('\n') : '{}'}\nlisteners:\n  - host: ${JSON.stringify(server.address)}\n    motd: "A Minecraft network"\n    max_players: 100\n    query_enabled: false\n    force_default_server: true\n    priorities: [${backends.map((backend) => JSON.stringify(backend.id)).join(', ')}]\n    forced_hosts: {}\n    tab_list: GLOBAL_PING\n`)
    } else {
      writeNew(resolve(directory, 'eula.txt'), '# Review https://aka.ms/MinecraftEULA before accepting.\neula=false\n')
      writeNew(resolve(directory, 'server.properties'), `server-ip=127.0.0.1\nserver-port=${server.address.split(':')[1]}\nonline-mode=false\nenforce-secure-profile=false\nmax-players=20\nenable-status=true\nenable-query=false\nenable-rcon=false\ngamemode=${server.id === 'creative' ? 'creative' : 'survival'}\nmotd=${server.name}\n`)
      mkdirSync(resolve(directory, 'config'), { recursive: true })
      if (proxy.kind === 'velocity') writeNew(resolve(directory, 'config/paper-global.yml'), `proxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: ${JSON.stringify(secret)}\n`)
      else {
        writeNew(resolve(directory, 'config/paper-global.yml'), 'proxies:\n  bungee-cord:\n    online-mode: true\n')
        writeNew(resolve(directory, 'spigot.yml'), 'settings:\n  bungeecord: true\n')
      }
    }
  }
}
