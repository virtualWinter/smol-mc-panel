import { execFile, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { loadConfig, saveConfig, validateNetwork, type ServerConfig, javaVersions } from './config'
import { PanelError } from './errors'
import { formatBytes, listDirectory } from './files'
import { appendMetric, emptyMetrics, processUsage, queryPlayers } from './metrics'
import { safePath, serverDirectory } from './paths'
import { ProcessManager } from './process-manager'
import { provisionNetwork } from './provision'
import { startupArgs } from './startup'
import type { Backup, DownloadProgressState, MetricHistory, PanelState, Server } from '../types'
import { acquireLock } from './lock'
import { installedSource, reinstallJar } from './downloads'
import { installJava, localJava } from './java'

const execute = promisify(execFile)

export class NetworkRuntime {
  configs: ServerConfig[]
  readonly manager: ProcessManager
  private metrics: Record<string, MetricHistory> = {}
  private usage = new Map<string, { ticks: number; at: number }>()
  private playerCounts = new Map<string, { online: number; max: number }>()
  private sampling = false
  private timer: ReturnType<typeof setInterval>
  private ticksPerSecond = 100
  private lastTpsRequest = 0
  private backupJobs = new Set<string>()
  private writeJobs = new Set<string>()
  private javaExecutables = new Map<number, string>()
  private javaJobs = new Map<number, { promise: Promise<string>; progress?: DownloadProgressState; listeners: Set<(progress: DownloadProgressState) => void> }>()
  private downloads: Record<string, DownloadProgressState> = {}
  private releaseLock: () => void

  constructor(readonly root: string, autostart = true) {
    mkdirSync(root, { recursive: true, mode: 0o700 })
    this.releaseLock = acquireLock(root)
    try {
    const pidFile = resolve(root, 'processes.json')
    if (existsSync(pidFile)) {
      const pids = JSON.parse(readFileSync(pidFile, 'utf8')) as Record<string, number>
      for (const [id, pid] of Object.entries(pids)) {
        if (!Number.isInteger(pid) || pid < 1) throw new PanelError('Invalid process registry. Inspect processes.json before starting.')
        let alive = true
        try { process.kill(pid, 0) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false }
        if (alive) throw new PanelError(`Process ${pid} (${id}) survived a previous panel shutdown. Stop or verify it before removing its entry from processes.json.`)
      }
    }
    this.configs = loadConfig(root)
    for (const config of this.configs) serverDirectory(root, config.workingDirectory)
    provisionNetwork(root, this.configs)
    try { this.ticksPerSecond = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 1000 })) || 100 } catch { /* Linux normally uses 100 clock ticks. */ }
    this.manager = new ProcessManager({ directory: (config) => this.directory(config.id), beforeStart: (config) => this.checkStart(config), executable: (config) => this.javaExecutables.get(Number(config.javaVersion.split(' ')[1]))!, onProcessChange: () => {
      const pids = Object.fromEntries([...this.manager.processes].filter(([, item]) => item.child?.pid).map(([id, item]) => [id, item.child!.pid]))
      writeFileSync(`${pidFile}.tmp`, JSON.stringify(pids), { mode: 0o600 })
      renameSync(`${pidFile}.tmp`, pidFile)
    } })
    for (const config of this.configs) this.metrics[config.id] = emptyMetrics(config.kind === 'velocity')
    this.timer = setInterval(() => { void this.sample() }, 2000)
    this.timer.unref()
    if (autostart) {
      const timer = setTimeout(() => { void this.startEligible() }, 0)
      timer.unref()
    }
    } catch (error) { this.releaseLock(); throw error }
  }

  config(id: string) {
    const config = this.configs.find((server) => server.id === id)
    if (!config) throw new PanelError('Server not found.')
    return config
  }

  assertWritable(id: string) {
    this.config(id)
    const item = this.manager.get(id)
    if (item.child || item.restartTimer || this.backupJobs.has(id) || this.writeJobs.has(id)) throw new PanelError('Stop the server and wait for active file operations or backups to finish.')
  }

  async withWrite<T>(id: string, operation: () => T | Promise<T>): Promise<T> {
    this.assertWritable(id)
    this.writeJobs.add(id)
    try { return await operation() } finally { this.writeJobs.delete(id) }
  }

  directory(id: string) { return serverDirectory(this.root, this.config(id).workingDirectory) }
  installed(id: string) { const path = safePath(this.directory(id), this.config(id).jarFile); return existsSync(path) && statSync(path).isFile() }
  eulaAccepted(id: string) {
    if (this.config(id).kind === 'velocity') return true
    const path = safePath(this.directory(id), 'eula.txt')
    return existsSync(path) && /^eula\s*=\s*true\s*$/mu.test(readFileSync(path, 'utf8'))
  }

  private checkStart(config: ServerConfig) {
    if (this.backupJobs.has(config.id) || this.writeJobs.has(config.id)) throw new PanelError('Wait for active file operations or backups to finish.')
    this.checkAssets(config)
    if (!this.javaExecutables.has(Number(config.javaVersion.split(' ')[1]))) throw new PanelError('Java has not been prepared for this server.')
  }

  private checkAssets(config: ServerConfig) {
    if (!this.installed(config.id)) throw new PanelError(`Upload ${config.jarFile} in Files before starting this server.`)
    if (!this.eulaAccepted(config.id)) throw new PanelError('Review and accept the Minecraft EULA in Settings before starting Paper.')
    startupArgs(config)
  }

  private async ensureJava(config: ServerConfig) {
    const major = Number(config.javaVersion.split(' ')[1])
    if (this.javaExecutables.has(major)) return
    let job = this.javaJobs.get(major)
    if (!job) {
      const local = localJava(this.root, major)
      if (local) { this.javaExecutables.set(major, local); return }
      job = { promise: Promise.resolve(''), listeners: new Set() }
      const current = job
      current.promise = Promise.resolve().then(() => installJava({ root: this.root, major, onProgress: (progress) => {
        current.progress = progress
        for (const listener of current.listeners) listener(progress)
      } })).then((executable) => { this.javaExecutables.set(major, executable); return executable }).finally(() => { this.javaJobs.delete(major) })
      this.javaJobs.set(major, job)
    }
    const listener = (progress: DownloadProgressState) => { this.downloads[config.id] = progress }
    job.listeners.add(listener)
    if (job.progress) listener(job.progress)
    this.manager.log(config.id, `[Panel] Preparing Java ${major} in network/java-${major}.`)
    try { await job.promise }
    catch (error) {
      const message = error instanceof PanelError ? error.message : `Java ${major} installation failed.`
      this.downloads[config.id] = { ...(this.downloads[config.id] ?? { received: 0, total: 0, bytesPerSecond: 0 }), label: `Java ${major}`, phase: 'failed', error: message }
      this.manager.log(config.id, `[Panel] ${message}`)
      throw error
    } finally { job.listeners.delete(listener) }
  }

  private async startEligible() {
    for (const config of [...this.configs].sort((a, b) => Number(a.kind === 'velocity') - Number(b.kind === 'velocity'))) {
      if (config.autoStart && this.installed(config.id) && this.eulaAccepted(config.id)) {
        try { await this.power(config.id, 'Start') } catch (error) { this.manager.log(config.id, `[Panel] Autostart skipped: ${String(error)}`) }
      }
    }
  }

  async power(id: string, action: 'Start' | 'Restart' | 'Stop') {
    const config = this.config(id)
    if (this.backupJobs.has(id) || this.writeJobs.has(id)) throw new PanelError('Wait for active file operations or backups to finish.')
    if (action === 'Stop' || action === 'Restart') await this.manager.stop(config)
    if (action === 'Start' || action === 'Restart') {
      this.checkAssets(config)
      await this.withWrite(id, () => this.ensureJava(config))
      await this.manager.start(config)
    }
  }

  saveSettings(id: string, input: Partial<Server>) {
    const current = this.config(id)
    this.assertWritable(id)
    if (input.workingDirectory !== current.workingDirectory) throw new PanelError('The managed working directory cannot be changed from the panel.')
    const next: ServerConfig = { ...current }
    for (const key of ['name', 'address', 'javaVersion', 'jarFile', 'startupCommand', 'stopCommand'] as const) {
      if (typeof input[key] !== 'string') throw new PanelError(`Invalid ${key}.`)
      next[key] = input[key].trim()
    }
    next.minMemory = Number(input.minMemory); next.maxMemory = Number(input.maxMemory)
    if (typeof input.restartOnCrash !== 'boolean') throw new PanelError('Invalid crash recovery setting.')
    next.restartOnCrash = input.restartOnCrash
    const configs = this.configs.map((server) => server.id === id ? next : server)
    validateNetwork(configs); startupArgs(next)
    if (next.address !== current.address) {
      if (this.configs.some((server) => this.manager.get(server.id).child)) throw new PanelError('Stop the whole network before changing ports.')
      throw new PanelError('Port changes currently require editing panel.json and the matching server configuration while the panel is stopped.')
    }
    saveConfig(this.root, configs)
    this.configs = configs
  }

  reorder(active: string, over: string) {
    this.config(active); this.config(over)
    const configs = [...this.configs]
    const from = configs.findIndex((server) => server.id === active), to = configs.findIndex((server) => server.id === over)
    const [moved] = configs.splice(from, 1); configs.splice(to, 0, moved)
    saveConfig(this.root, configs); this.configs = configs
  }

  acceptEula(id: string) {
    this.assertWritable(id)
    if (this.config(id).kind !== 'paper' || this.manager.get(id).child) throw new PanelError('Stop the Paper server before accepting the EULA.')
    writeFileSync(safePath(this.directory(id), 'eula.txt'), '# Accepted through the panel. https://aka.ms/MinecraftEULA\neula=true\n', { mode: 0o600 })
  }

  async reinstall(id: string) {
    const config = this.config(id)
    await this.withWrite(id, async () => {
      this.manager.log(id, `[Panel] Downloading ${config.kind === 'velocity' ? 'Velocity' : 'Paper'} JAR.`)
      try {
        const source = await reinstallJar({ directory: this.directory(id), jarFile: config.jarFile, project: config.kind === 'velocity' ? 'velocity' : 'paper', manifest: resolve(this.root, 'installations', `${id}.json`), onProgress: (progress) => { this.downloads[id] = progress } })
        await this.ensureJava(config)
        this.downloads[id] = { phase: 'complete', received: source.size, total: source.size, bytesPerSecond: 0 }
        this.manager.log(id, `[Panel] Installed ${source.project} ${source.version} build ${source.build}. Server remains stopped.`)
      } catch (error) {
        const message = error instanceof PanelError ? error.message : 'Download failed.'
        this.downloads[id] = { ...(this.downloads[id] ?? { received: 0, total: 0, bytesPerSecond: 0 }), phase: 'failed', error: message }
        this.manager.log(id, `[Panel] ${message}`)
        throw error
      }
    })
  }

  private async sample() {
    if (this.sampling) return
    this.sampling = true
    try {
      const requestTps = Date.now() - this.lastTpsRequest >= 15_000
      if (requestTps) this.lastTpsRequest = Date.now()
      await Promise.all(this.configs.map(async (config) => {
        const process = this.manager.get(config.id)
        const history = this.metrics[config.id]
        if (!process.child?.pid) { this.usage.delete(config.id); this.playerCounts.delete(config.id); appendMetric(history.cpu, 0); appendMetric(history.ram, 0); appendMetric(history.players, 0); return }
        const usage = processUsage(process.child.pid)
        const previous = this.usage.get(config.id)
        if (usage) {
          const now = Date.now()
          if (previous) appendMetric(history.cpu, Math.max(0, (usage.ticks - previous.ticks) / this.ticksPerSecond / ((now - previous.at) / 1000) * 100))
          appendMetric(history.ram, usage.rssMiB)
          this.usage.set(config.id, { ticks: usage.ticks, at: now })
        }
        const players = await queryPlayers(Number(config.address.split(':')[1]))
        if (players) { this.playerCounts.set(config.id, players); appendMetric(history.players, players.online) }
        if (config.kind === 'paper' && process.status === 'Online') {
          if (requestTps) this.manager.command(config.id, 'tps', false)
          if (process.lastTps !== undefined) appendMetric(history.tps, process.lastTps)
        }
      }))
    } catch { /* A process can exit between metric reads. */ }
    finally { this.sampling = false }
  }

  private backups(id: string): Backup[] {
    this.config(id)
    const directory = resolve(this.root, 'backups', id)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    return readdirSync(directory).filter((name) => /^[a-f0-9-]{36}\.tar\.gz$/u.test(name)).map((name) => {
      const path = safePath(directory, name), info = statSync(path)
      return { id: name.slice(0, -7), name: 'Manual backup', created: info.mtime.toISOString(), size: formatBytes(info.size) }
    }).sort((a, b) => b.created.localeCompare(a.created))
  }

  async createBackup(id: string) {
    this.assertWritable(id)
    const source = this.directory(id)
    const directory = resolve(this.root, 'backups', id)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const target = resolve(directory, `${randomUUID()}.tar.gz`)
    this.backupJobs.add(id)
    try {
      await execute('tar', ['-czf', `${target}.tmp`, '-C', source, '.'], { timeout: 300_000, maxBuffer: 1024 * 1024 })
      renameSync(`${target}.tmp`, target)
    } catch { if (existsSync(`${target}.tmp`)) unlinkSync(`${target}.tmp`); throw new PanelError('Backup failed. Ensure tar is installed and there is enough disk space.') }
    finally { this.backupJobs.delete(id) }
  }

  deleteBackup(id: string, backupId: string) {
    this.config(id)
    if (!/^[a-f0-9-]{36}$/u.test(backupId)) throw new PanelError('Invalid backup ID.')
    unlinkSync(safePath(resolve(this.root, 'backups', id), `${backupId}.tar.gz`))
  }

  snapshot(url: string): PanelState {
    const request = new URL(url)
    const serverId = request.pathname.split('/').filter(Boolean)[0]
    const filePath = request.searchParams.get('path') ?? ''
    const servers: Server[] = this.configs.map((config) => {
      const item = this.manager.get(config.id), history = this.metrics[config.id], players = this.playerCounts.get(config.id)
      const source = installedSource(resolve(this.root, 'installations', `${config.id}.json`), config.kind === 'velocity' ? 'velocity' : 'paper', config.jarFile)
      return { ...config, download: this.downloads[config.id] ? { ...this.downloads[config.id] } : undefined, jarVersion: source ? `${source.version} (build ${source.build})` : undefined, installed: this.installed(config.id), eulaAccepted: this.eulaAccepted(config.id), status: item.status, logs: [...item.logs], logOffset: item.logCount - item.logs.length, cpu: history.cpu.length ? `${history.cpu.at(-1)!.toFixed(1)}%` : '—', memory: history.ram.length ? `${history.ram.at(-1)!.toFixed(0)} / ${config.maxMemory} MiB` : `— / ${config.maxMemory} MiB`, players: players ? `${players.online} / ${players.max}` : '—' }
    })
    let files: PanelState['files'] = {}
    if (serverId && this.configs.some((server) => server.id === serverId) && request.pathname.endsWith('/files')) {
      try { files = { [serverId]: listDirectory(this.directory(serverId), filePath) } }
      catch { files = { [serverId]: [] } }
    }
    return { servers, files, filePath, backups: Object.fromEntries(this.configs.map((config) => [config.id, this.backups(config.id)])), metrics: structuredClone(this.metrics), javaVersions }
  }

  async shutdown() { clearInterval(this.timer); try { await this.manager.shutdown(this.configs) } finally { this.releaseLock() } }
}
