import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync as readFileSyncFs, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server as SocketServer, Socket } from 'node:net'
import { resolve } from 'node:path'
import type { ServerConfig } from './config'
import { PanelError } from './errors'
import { safePath } from './paths'
import type { Permissions } from './permissions'

const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length >= 1 && value.length <= max && !value.includes('\0')

/** Pushes the panel's permission snapshot to running servers over a Unix socket.
 *
 * The plugin connects, authenticates with the per-server token, and receives the current
 * snapshot; the panel then pushes a new snapshot whenever permissions change, so edits
 * are applied live instead of being polled from a file. The socket path and token are
 * written into the server directory so the plugin can find them at startup. */
export class PermissionChannel {
  private closing = false
  private server?: SocketServer
  private starting?: Promise<void>
  private tokens = new Map<string, string>()
  private clients = new Set<Socket>()
  readonly socketPath: string
  constructor(private root: string, private pidFor: (id: string) => number | undefined, private permissions: Permissions) {
    this.socketPath = resolve(root, 'permissions.sock')
    this.loadTokens()
  }

  private loadTokens() {
    const path = resolve(this.root, 'permission-clients', 'tokens.json')
    try {
      const data = JSON.parse(readFileSyncFs(path, 'utf8')) as Record<string, string>
      for (const [k, v] of Object.entries(data)) this.tokens.set(k, v)
    } catch { /* first run */ }
  }

  private saveTokens() {
    const dir = resolve(this.root, 'permission-clients')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const path = resolve(dir, 'tokens.json')
    const data: Record<string, string> = {}
    for (const [k, v] of this.tokens) data[k] = v
    writeFileSync(path, JSON.stringify(data), { mode: 0o600 })
  }

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
    const finish = () => {
      this.clients.add(socket)
      socket.setTimeout(0)
      socket.on('close', () => this.clients.delete(socket))
      socket.on('error', () => this.clients.delete(socket))
      this.send(socket, { type: 'snapshot', content: this.permissions.serialize() })
      socket.on('data', () => {})
    }
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const end = buffer.indexOf('\n')
      if (end < 0) { if (buffer.length > 65536) socket.destroy(); return }
      const frame = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      let data: Record<string, unknown>
      try { data = JSON.parse(frame) as Record<string, unknown> } catch { console.error('AUTH: parse failed'); socket.destroy(); return }
      if (data.version !== 1 || !text(data.serverId, 64) || !text(data.token, 64)) { console.error('AUTH: bad fields', data.version, data.serverId, typeof data.token); socket.destroy(); return }
      const expected = this.tokens.get(data.serverId as string)
      if (!expected || (data.token as string).length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(data.token as string))) { console.error('AUTH: token mismatch', expected?.slice(0,8), (data.token as string)?.slice(0,8)); socket.destroy(); return }
      const pid = this.pidFor(data.serverId as string)
      if (pid !== undefined && data.pid !== pid) { console.error('AUTH: pid mismatch', pid, data.pid); socket.destroy(); return }
      finish()
    })
    socket.on('error', () => {})
  }

  private send(socket: Socket, message: Record<string, unknown>) {
    try { socket.write(JSON.stringify(message) + '\n') } catch { socket.destroy() }
  }

  /** Pushes the current snapshot to every connected plugin. */
  broadcast() {
    const frame = JSON.stringify({ type: 'snapshot', content: this.permissions.serialize() }) + '\n'
    for (const socket of [...this.clients]) {
      try { socket.write(frame) } catch { socket.destroy(); this.clients.delete(socket) }
    }
  }

  /** Writes the connection details the plugin reads at startup. */
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
    for (const socket of this.clients) socket.destroy()
    this.clients.clear()
    if (this.server) {
      this.server.close()
      this.server = undefined
    }
    if (existsSync(this.socketPath) && lstatSync(this.socketPath).isSocket()) unlinkSync(this.socketPath)
    this.starting = undefined
  }
}
