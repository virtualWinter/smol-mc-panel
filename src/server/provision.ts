import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ServerConfig } from './config'
import { serverDirectory } from './paths'

const writeNew = (path: string, content: string) => { if (!existsSync(path)) writeFileSync(path, content, { flag: 'wx', mode: 0o600 }) }

export function provisionNetwork(root: string, servers: ServerConfig[]) {
  const secretPath = resolve(root, 'forwarding.secret')
  writeNew(secretPath, randomBytes(32).toString('hex'))
  const secret = readFileSync(secretPath, 'utf8').trim()
  const backends = servers.filter((server) => server.kind === 'paper')
  for (const server of servers) {
    const directory = serverDirectory(root, server.workingDirectory)
    mkdirSync(resolve(directory, 'plugins'), { recursive: true })
    if (server.kind === 'velocity') {
      writeNew(resolve(directory, 'forwarding.secret'), secret)
      writeNew(resolve(directory, 'velocity.toml'), `config-version = "2.8"\nbind = "${server.address}"\nmotd = "A Minecraft network"\nshow-max-players = 100\nonline-mode = true\nplayer-info-forwarding-mode = "modern"\nforwarding-secret-file = "forwarding.secret"\nping-passthrough = "DISABLED"\n\n[servers]\n${backends.map((backend) => `${backend.id} = "${backend.address}"`).join('\n')}\ntry = [${backends.length ? JSON.stringify(backends[0].id) : ''}]\n`)
    } else {
      writeNew(resolve(directory, 'eula.txt'), '# Review https://aka.ms/MinecraftEULA before accepting.\neula=false\n')
      writeNew(resolve(directory, 'server.properties'), `server-ip=127.0.0.1\nserver-port=${server.address.split(':')[1]}\nonline-mode=false\nenforce-secure-profile=false\nmax-players=20\nenable-status=true\nenable-query=false\nenable-rcon=false\ngamemode=${server.id === 'creative' ? 'creative' : 'survival'}\nmotd=${server.name}\n`)
      mkdirSync(resolve(directory, 'config'), { recursive: true })
      writeNew(resolve(directory, 'config/paper-global.yml'), `proxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: ${JSON.stringify(secret)}\n`)
    }
  }
}
