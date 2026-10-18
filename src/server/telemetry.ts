import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, existsSync, lstatSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server as SocketServer } from 'node:net'
import { resolve } from 'node:path'
import type { AgentMetrics } from '../types'
import type { ServerConfig } from './config'
import { PanelError } from './errors'
import { safePath } from './paths'

const number = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length >= 1 && value.length <= max && !value.includes('\0')

export class TelemetryCollector {
  private server?: SocketServer
  private starting?: Promise<void>
  private tokens = new Map<string, string>()
  private metrics = new Map<string, AgentMetrics>()
  private kicks = new Map<string, { uuid: string; at: number; pid: number }[]>()
  readonly socketPath: string
  constructor(private root: string, private pidFor: (id: string) => number | undefined) { this.socketPath = resolve(root, 'metrics.sock') }

  async start() {
    if (this.starting) return this.starting
    this.starting = new Promise<void>((resolve, reject) => {
      if (Buffer.byteLength(this.socketPath) > 100) { reject(new PanelError('Data directory is too long for the metrics Unix socket. Use a shorter PANEL_DATA_DIR.')); return }
      if (existsSync(this.socketPath)) {
        if (!lstatSync(this.socketPath).isSocket()) { reject(new PanelError('Metrics socket path is occupied by a regular file.')); return }
        unlinkSync(this.socketPath)
      }
      const server = createServer((socket) => {
        let bytes = 0, frame = Buffer.alloc(0)
        socket.setTimeout(2000, () => socket.destroy())
        socket.on('error', () => {})
        socket.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > 65536) { socket.destroy(); return }
          frame = Buffer.concat([frame, chunk])
          const end = frame.indexOf(10)
          if (end < 0) return
          const id = this.accept(frame.subarray(0, end).toString('utf8'))
          const queued = id ? (this.kicks.get(id) ?? []).filter((job) => Date.now() - job.at < 30_000 && job.pid === this.pidFor(id)) : []
          if (id) this.kicks.delete(id)
          socket.end(queued.map((job) => `kick ${job.uuid}\n`).join(''))
        })
      })
      server.maxConnections = 32
      server.on('error', reject)
      server.listen(this.socketPath, () => { chmodSync(this.socketPath, 0o600); this.server = server; server.unref(); resolve() })
    })
    try { await this.starting } catch (error) { this.starting = undefined; throw error }
  }

  configuration(config: ServerConfig): string {
    const directory = safePath(this.root, 'agents')
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    let token = this.tokens.get(config.id)
    if (!token) { token = randomBytes(32).toString('hex'); this.tokens.set(config.id, token) }
    const escape = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\r', '\\r')
    const path = safePath(directory, `${config.id}.properties`)
    writeFileSync(path, `socket=${escape(this.socketPath)}\nserverId=${config.id}\nkind=${config.kind}\ntoken=${token}\n`, { mode: 0o600 })
    return path
  }

  private accept(frame: string) {
    try {
      const data = JSON.parse(frame) as Record<string, unknown>
      if (data.version !== 1 || !text(data.serverId, 64) || !text(data.token, 64)) return
      const expected = this.tokens.get(data.serverId)
      if (!expected || data.token.length !== expected.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(data.token)) || data.pid !== this.pidFor(data.serverId)) return
      if (!number(data.heapUsed) || !number(data.heapMax) || !number(data.heapCommitted) || !number(data.uptime) || !number(data.threads, 1_000_000) || !text(data.javaVersion, 128)) return
      const value: AgentMetrics = { receivedAt: Date.now(), heapUsed: data.heapUsed, heapMax: data.heapMax, heapCommitted: data.heapCommitted, uptime: data.uptime, threads: data.threads, javaVersion: data.javaVersion }
      if (number(data.cpu, 100_000)) value.cpu = data.cpu
      if (number(data.onlinePlayers, 1_000_000)) value.onlinePlayers = data.onlinePlayers
      if (number(data.maxPlayers, 1_000_000)) value.maxPlayers = data.maxPlayers
      if (number(data.mspt, 120_000)) value.mspt = data.mspt
      if (number(data.networkIn, 1_000_000_000)) value.networkIn = data.networkIn
      if (number(data.networkOut, 1_000_000_000)) value.networkOut = data.networkOut
      if (text(data.serverVersion, 512)) value.serverVersion = data.serverVersion
      if (text(data.minecraftVersion, 40) && /^[0-9][0-9a-zA-Z.+_-]{1,39}$/u.test(data.minecraftVersion)) value.minecraftVersion = data.minecraftVersion
      if (data.proxyControl === true) value.proxyControl = true
      if (Array.isArray(data.tps) && data.tps.length === 3 && data.tps.every((item) => number(item, 25))) value.tps = data.tps.map((item: number) => Math.min(20, item))
      if (Array.isArray(data.players)) value.players = data.players.slice(0, 200).filter((item) => item && text(item.name, 64) && text(item.uuid, 64) && number(item.ping, 1_000_000)).map((item) => ({ name: item.name, uuid: item.uuid, ping: item.ping, ...(text(item.serverId, 64) && /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(item.serverId) ? { serverId: item.serverId } : {}) }))
      if (Array.isArray(data.worlds)) value.worlds = data.worlds.slice(0, 32).filter((item) => item && text(item.name, 128) && number(item.players, 1_000_000) && number(item.entities, 100_000_000) && number(item.chunks, 100_000_000)).map((item) => ({ name: item.name, players: item.players, entities: item.entities, chunks: item.chunks }))
      this.metrics.set(data.serverId, value)
      return data.serverId
    } catch { /* Reject malformed, unauthenticated, or oversized frames. */ }
  }

  latest(id: string): AgentMetrics | undefined {
    const value = this.metrics.get(id)
    return this.pidFor(id) && value && Date.now() - value.receivedAt < 6000 ? structuredClone(value) : undefined
  }

  kick(id: string, uuid: string) {
    const pid = this.pidFor(id)
    if (!pid || !this.latest(id)?.proxyControl) throw new PanelError('Restart the Velocity proxy to enable network-wide kicks, then try again.')
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(uuid)) throw new PanelError('Invalid player UUID.')
    const jobs = (this.kicks.get(id) ?? []).filter((job) => Date.now() - job.at < 30_000)
    if (jobs.length >= 50) throw new PanelError('Wait for pending player disconnects to complete.')
    this.kicks.set(id, [...jobs, { uuid, at: Date.now(), pid }])
  }

  async close() {
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    if (existsSync(this.socketPath) && lstatSync(this.socketPath).isSocket()) unlinkSync(this.socketPath)
    this.server = undefined; this.starting = undefined; this.metrics.clear(); this.kicks.clear()
  }
}
