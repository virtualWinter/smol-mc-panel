import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server as SocketServer, Socket } from 'node:net'
import { resolve } from 'node:path'
import type { ServerConfig } from './config'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { safePath } from './paths'
import type { PermissionService } from './permission-service'

const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length >= 1 && value.length <= max && !value.includes('\0')

export class PermissionChannel {
  private server?: SocketServer
  private starting?: Promise<void>
  private closing = false
  private tokens = new Map<string, string>()
  private clients = new Map<string, Set<Socket>>()
  private available = new Map<string, string[]>()
  readonly socketPath: string

  constructor(private root: string, private pidFor: (id: string) => number | undefined, private permissionService: PermissionService, private serverFor: (id: string) => { id: string; group?: string } = (id) => ({ id })) {
    this.socketPath = resolve(root, 'permissions.sock')
    this.loadTokens()
  }

  private loadTokens() {
    const path = resolve(this.root, 'permission-clients', 'tokens.json')
    const data = readJson<Record<string, string>>(path, {})
    for (const [k, v] of Object.entries(data)) this.tokens.set(k, v)
  }

  private saveTokens() {
    const path = resolve(this.root, 'permission-clients', 'tokens.json')
    const data: Record<string, string> = {}
    for (const [k, v] of this.tokens) data[k] = v
    saveJson(path, data)
  }

  availablePermissions(serverId: string): string[] { return this.available.get(serverId) ?? [] }

  async start() {
    if (this.starting) return this.starting
    if (this.closing) return
    this.starting = new Promise<void>((resolvePromise, reject) => {
      if (Buffer.byteLength(this.socketPath) > 100) { reject(new PanelError('Data directory is too long for the permissions Unix socket.')); return }
      if (existsSync(this.socketPath)) {
        if (!lstatSync(this.socketPath).isSocket()) { reject(new PanelError('Permissions socket path is occupied by a regular file.')); return }
        unlinkSync(this.socketPath)
      }
      const server = createServer((socket) => { this.handleConnection(socket) })
      server.maxConnections = 64
      server.on('error', () => {})
      server.listen(this.socketPath, () => {
        if (this.closing) { server.close(); return }
        chmodSync(this.socketPath, 0o600); this.server = server; server.unref(); resolvePromise()
      })
    })
    try { await this.starting } catch (error) { this.starting = undefined; throw error }
  }

  private handleConnection(socket: Socket) {
    socket.setTimeout(10_000, () => socket.destroy())
    let buffer = ''
    let authed = false
    let serverId = ''
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        if (!authed) {
          let data: Record<string, unknown>
          try { data = JSON.parse(frame) as Record<string, unknown> } catch { socket.destroy(); return }
          if (data.version !== 1 || !text(data.serverId, 64) || !text(data.token, 64)) { socket.destroy(); return }
          const expected = this.tokens.get(data.serverId as string)
          if (!expected || (data.token as string).length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(data.token as string))) { socket.destroy(); return }
          const pid = this.pidFor(data.serverId as string)
          if (pid !== undefined && data.pid !== pid) { socket.destroy(); return }
          serverId = data.serverId as string
          authed = true
          socket.setTimeout(0)
          if (!this.clients.has(serverId)) this.clients.set(serverId, new Set())
          this.clients.get(serverId)!.add(socket)
          socket.on('close', () => { this.clients.get(serverId)?.delete(socket) })
          socket.on('error', () => { this.clients.get(serverId)?.delete(socket) })
          this.send(socket, { type: 'snapshot', content: this.permissionService.serializeForServer(this.serverFor(serverId)) })
          continue
        }
        try {
          const msg = JSON.parse(frame) as Record<string, unknown>
          if (msg.type === 'permissions' && Array.isArray(msg.names)) {
            this.available.set(serverId, msg.names.filter((n): n is string => typeof n === 'string').slice(0, 10000))
          }
        } catch { /* ignore malformed */ }
      }
      if (buffer.length > 65536) socket.destroy()
    })
    socket.on('error', () => {})
  }

  private send(socket: Socket, message: Record<string, unknown>) {
    try { socket.write(JSON.stringify(message) + '\n') } catch { socket.destroy() }
  }

  broadcast() {
    for (const [serverId, sockets] of this.clients) {
      const frame = JSON.stringify({ type: 'snapshot', content: this.permissionService.serializeForServer(this.serverFor(serverId)) }) + '\n'
      for (const socket of [...sockets]) {
        try { socket.write(frame) } catch { socket.destroy(); sockets.delete(socket) }
      }
    }
  }

  configuration(config: ServerConfig, directory: string): string {
    let token = this.tokens.get(config.id)
    if (!token) { token = randomBytes(32).toString('hex'); this.tokens.set(config.id, token); this.saveTokens() }
    const dir = safePath(directory, 'plugins/smol-panel')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const path = resolve(dir, 'client.properties')
    const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\r', '\\r')
    writeFileSync(path, `socket=${escape(this.socketPath)}\nserverId=${config.id}\ntoken=${token}\n`, { mode: 0o600 })
    return path
  }

  close() {
    this.closing = true
    for (const sockets of this.clients.values()) for (const socket of sockets) socket.destroy()
    this.clients.clear()
    if (this.server) {
      this.server.close()
      this.server = undefined
    }
    if (existsSync(this.socketPath) && lstatSync(this.socketPath).isSocket()) unlinkSync(this.socketPath)
    this.starting = undefined
  }
}
