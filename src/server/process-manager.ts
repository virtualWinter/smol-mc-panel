import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { stripVTControlCharacters } from 'node:util'
import type { ServerConfig } from './config'
import { PanelError } from './errors'
import { startupArgs } from './startup'

export interface ManagedProcess {
  child?: ChildProcessWithoutNullStreams
  status: string
  logs: string[]
  logCount: number
  intentionalStop: boolean
  restarts: number[]
  restartTimer?: ReturnType<typeof setTimeout>
  lastTps?: number
}

interface Options {
  directory: (config: ServerConfig) => string
  beforeStart: (config: ServerConfig) => void
  launch?: (executable: string, args: string[], cwd: string) => ChildProcessWithoutNullStreams
  stopTimeout?: number
  restartDelay?: number
  onProcessChange?: () => void
}

export class ProcessManager {
  readonly processes = new Map<string, ManagedProcess>()
  private shuttingDown = false
  constructor(private options: Options) {}

  get(id: string): ManagedProcess {
    let item = this.processes.get(id)
    if (!item) { item = { status: 'Offline', logs: [], logCount: 0, intentionalStop: false, restarts: [] }; this.processes.set(id, item) }
    return item
  }

  log(id: string, line: string) {
    const item = this.get(id)
    item.logs.push(line.slice(0, 16384))
    item.logCount++
    if (item.logs.length > 1000) item.logs.splice(0, item.logs.length - 1000)
    const plain = stripVTControlCharacters(line)
    if (/TPS from last/u.test(plain)) {
      const value = Number(plain.split(':').at(-1)?.match(/[\d.]+/u)?.[0])
      if (Number.isFinite(value)) item.lastTps = Math.min(20, value)
    }
    if (/Done \(|Listening on|Done \([\d.,]+s\)!/u.test(plain) && item.child && item.status === 'Starting') item.status = 'Online'
  }

  async start(config: ServerConfig, automatic = false) {
    if (this.shuttingDown) throw new PanelError('The panel is shutting down.')
    const item = this.get(config.id)
    if (item.child || item.status === 'Starting') throw new PanelError('Server is already running or starting.')
    clearTimeout(item.restartTimer)
    item.restartTimer = undefined
    this.options.beforeStart(config)
    const args = startupArgs(config)
    if (!automatic) item.restarts = []
    item.intentionalStop = false
    item.lastTps = undefined
    item.status = 'Starting'
    const major = config.javaVersion.split(' ')[1]
    const executable = process.env[`JAVA_${major}_BIN`] || 'java'
    this.log(config.id, `[Panel] Starting ${config.name} with ${config.javaVersion}.`)
    const launch = this.options.launch ?? ((java, args, cwd) => spawn(java, args, { cwd, stdio: 'pipe', shell: false, env: { ...process.env, TERM: 'xterm-256color' } }))
    let child: ChildProcessWithoutNullStreams
    try { child = launch(executable, args, this.options.directory(config)) }
    catch (error) { item.status = 'Offline'; throw error }
    item.child = child
    const decoders = [new StringDecoder('utf8'), new StringDecoder('utf8')]
    const buffers = ['', '']
    const append = (index: number, text: string, flush = false) => {
      buffers[index] += text
      const lines = buffers[index].split(/\r?\n|\r/u)
      buffers[index] = lines.pop() ?? ''
      for (const line of lines) if (line) this.log(config.id, line)
      if (buffers[index].length > 16384 || flush) { if (buffers[index]) this.log(config.id, buffers[index]); buffers[index] = '' }
    }
    child.stdout.on('data', (chunk: Buffer) => append(0, decoders[0].write(chunk)))
    child.stderr.on('data', (chunk: Buffer) => append(1, decoders[1].write(chunk)))
    child.stdin.on('error', () => { /* A process can close stdin while stopping. */ })
    child.on('error', (error) => this.log(config.id, `[Panel] Process error: ${error.message}`))
    child.once('close', (code, signal) => {
      append(0, decoders[0].end(), true); append(1, decoders[1].end(), true)
      if (item.child !== child) return
      item.child = undefined
      try { this.options.onProcessChange?.() } catch (error) { this.log(config.id, `[Panel] Could not persist process state: ${String(error)}`) }
      item.status = 'Offline'
      this.log(config.id, `[Panel] Process exited (${signal ?? code ?? 'unknown'}).`)
      if (!item.intentionalStop && !this.shuttingDown && config.restartOnCrash && (code !== 0 || signal !== null)) {
        item.restarts = item.restarts.filter((time) => Date.now() - time < 600_000)
        if (item.restarts.length >= 5) { this.log(config.id, '[Panel] Crash recovery paused after 5 failures in 10 minutes.'); return }
        item.restarts.push(Date.now())
        item.status = 'Restarting'
        const delay = this.options.restartDelay ?? Math.min(30_000, 2000 * 2 ** (item.restarts.length - 1))
        this.log(config.id, `[Panel] Restarting in ${Math.round(delay / 1000)} seconds.`)
        item.restartTimer = setTimeout(() => {
          item.restartTimer = undefined
          void this.start(config, true).catch((error: unknown) => this.log(config.id, `[Panel] Restart failed: ${String(error)}`))
        }, delay)
        item.restartTimer.unref()
      }
    })
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => {
        try { this.options.onProcessChange?.(); resolve() }
        catch { item.intentionalStop = true; child.kill('SIGTERM'); reject(new PanelError('Could not persist the process ID; the server was stopped.')) }
      })
      child.once('error', () => reject(new PanelError(`Could not launch Java. Install ${config.javaVersion} or configure JAVA_${major}_BIN.`)))
    })
  }

  command(id: string, command: string, echo = true) {
    const item = this.get(id)
    if (!item.child || !item.child.stdin.writable || item.status === 'Stopping') throw new PanelError('Server is not accepting commands.')
    if (typeof command !== 'string' || !command.trim() || command.length > 4096 || /[\r\n\0]/u.test(command)) throw new PanelError('Commands must be a single line.')
    if (echo) this.log(id, `> ${command}`)
    item.child.stdin.write(`${command}\n`)
  }

  async stop(config: ServerConfig) {
    const item = this.get(config.id)
    clearTimeout(item.restartTimer)
    item.restartTimer = undefined
    item.intentionalStop = true
    const child = item.child
    if (!child) { item.status = 'Offline'; return }
    if (item.status === 'Stopping') throw new PanelError('Server is already stopping.')
    this.log(config.id, '[Panel] Requesting a graceful shutdown.')
    try { this.command(config.id, config.stopCommand, false) }
    catch { this.log(config.id, '[Panel] Console unavailable; sending SIGTERM.'); child.kill('SIGTERM') }
    item.status = 'Stopping'
    await new Promise<void>((resolve) => {
      const terminate = setTimeout(() => {
        this.log(config.id, '[Panel] Shutdown timed out; sending SIGTERM.')
        child.kill('SIGTERM')
      }, this.options.stopTimeout ?? 30_000)
      const kill = setTimeout(() => { child.kill('SIGKILL') }, (this.options.stopTimeout ?? 30_000) + 5000)
      terminate.unref(); kill.unref()
      child.once('close', () => { clearTimeout(terminate); clearTimeout(kill); resolve() })
    })
  }

  async shutdown(configs: ServerConfig[]) {
    this.shuttingDown = true
    await Promise.allSettled(configs.map((config) => this.stop(config)))
  }
}
