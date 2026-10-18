import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig, saveConfig, setupNetwork, validateNetwork, type ServerConfig, javaVersions } from './config'
import { PanelError } from './errors'
import { listDirectory } from './files'
import { appendMetric, emptyMetrics, processUsage, queryPlayers } from './metrics'
import { safePath, serverDirectory } from './paths'
import { ProcessManager } from './process-manager'
import { disablePaperWhitelist, provisionNetwork } from './provision'
import { startupArgs } from './startup'
import type { DownloadProgressState, MetricHistory, PanelState, Server, SetupServerInput, PluginProject } from '../types'
import { acquireLock } from './lock'
import { installedSource, reinstallJar } from './downloads'
import { installJava, managedJava } from './java'
import { proxyStartupIssue } from './proxy-config'
import { requiredJava } from './jar-java'
import { processAlive, processStart, registration } from './liveness'
import { buildAgent } from './agent-build'
import { readAgentSources } from './agent-sources'
import { TelemetryCollector } from './telemetry'
import { Backups } from './backups'
import { Plugins, searchPlugins, pluginReleases } from './plugins'
import { Players, validatePlayerAction, type PlayerAction } from './players'
import { readJson, saveJson } from './json-store'
import { reportedMinecraftVersion, reportedProxyVersion } from '../minecraft-version'

export class NetworkRuntime {
  private backupService: Backups
  private pluginService: Plugins
  private playerService: Players
  private backupTimer: ReturnType<typeof setInterval>
  private closing = false
  private minecraftVersions: Record<string, string>
  private proxyVersions: Record<string, string>
  configs: ServerConfig[]
  readonly manager: ProcessManager
  private metrics: Record<string, MetricHistory> = {}
  private usage = new Map<string, { ticks: number; at: number }>()
  private playerCounts = new Map<string, { online: number; max: number }>()
  private sampling = false
  private timer: ReturnType<typeof setInterval>
  private ticksPerSecond = 100
  private backupJobs = new Set<string>()
  private writeJobs = new Set<string>()
  private javaExecutables = new Map<number, string>()
  private javaJobs = new Map<number, { promise: Promise<string>; progress?: DownloadProgressState; listeners: Set<(progress: DownloadProgressState) => void> }>()
  private downloads: Record<string, DownloadProgressState> = {}
  private jarRequirements = new Map<string, { size: number; mtime: number; inode: number; major: number }>()
  private releaseLock: () => void
  private telemetry: TelemetryCollector
  private agentBuild?: Promise<string>
  private agentArgs = new Map<string, string[]>()

  constructor(readonly root: string, autostart = true, private enableAgent = true) {
    mkdirSync(root, { recursive: true, mode: 0o700 })
    this.releaseLock = acquireLock(root)
    try {
    const pidFile = resolve(root, 'processes.json')
    if (existsSync(pidFile)) {
      const data = JSON.parse(readFileSync(pidFile, 'utf8')) as Record<string, unknown>
      for (const [id, value] of Object.entries(data)) {
        const entry = registration(value)
        if (!entry) throw new PanelError('Invalid process registry. Inspect processes.json before starting.')
        if (processAlive(entry.pid, entry.start)) throw new PanelError(`Process ${entry.pid} (${id}) survived a previous panel shutdown. Stop or verify it before removing its entry from processes.json.`)
      }
    }
    this.configs = loadConfig(root)
    this.minecraftVersions = readJson(resolve(root, 'minecraft-versions.json'), {})
    this.proxyVersions = readJson(resolve(root, 'proxy-versions.json'), {})
    for (const config of this.configs) serverDirectory(root, config.workingDirectory)
    provisionNetwork(root, this.configs)
    try { this.ticksPerSecond = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 1000 })) || 100 } catch { /* Linux normally uses 100 clock ticks. */ }
    this.manager = new ProcessManager({ directory: (config) => this.directory(config.id), beforeStart: (config) => this.checkStart(config), executable: (config) => this.javaExecutables.get(Number(config.javaVersion.split(' ')[1]))!, extraJvmArgs: (config) => this.agentArgs.get(config.id) ?? [], onProcessChange: () => {
      const pids: Record<string, { pid: number; start: number }> = {}
      for (const [id, item] of this.manager.processes) {
        if (!item.child?.pid) continue
        const start = processStart(item.child.pid)
        if (start === undefined) continue
        pids[id] = { pid: item.child.pid, start }
      }
      writeFileSync(`${pidFile}.tmp`, JSON.stringify(pids), { mode: 0o600 })
      renameSync(`${pidFile}.tmp`, pidFile)
    } })
    this.telemetry = new TelemetryCollector(root, (id) => this.manager.get(id).child?.pid)
    this.pluginService = new Plugins(root)
    this.playerService = new Players(root)
    this.backupService = new Backups(root, {
      ids: () => this.configs.map((s) => s.id), directory: (id) => this.directory(id), assertIdle: (id) => this.assertWritable(id), busy: this.backupJobs,
      running: (id) => Boolean(this.manager.get(id).child),
      available: (id) => !this.closing && !this.writeJobs.has(id) && !this.backupJobs.has(id) && !this.manager.get(id).restartTimer,
      stop: (id) => this.manager.stop(this.config(id)), start: (id) => this.closing ? Promise.resolve() : this.power(id, 'Start'), log: (id, text) => this.manager.log(id, `[Panel] ${text}`),
    })
    this.backupTimer = setInterval(() => { void this.backupService.tick().catch(() => {}) }, 60_000)
    this.backupTimer.unref()
    for (const config of this.configs) void this.backupService.refresh(config.id).catch(() => {})
    for (const config of this.configs) this.metrics[config.id] = emptyMetrics(config.kind !== 'paper')
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

  addServer(input: SetupServerInput) {
    const backend = setupNetwork([input])[1]
    if (this.configs.filter((server) => server.kind === 'paper').length >= 20) throw new PanelError('The network supports up to 20 Paper servers.')
    if (this.configs.some((server) => server.id === backend.id)) throw new PanelError('That server ID is already in use.')
    if (existsSync(safePath(this.root, backend.workingDirectory))) throw new PanelError('That server directory already exists. Choose a new ID; preserved files will not be overwritten.')
    const next = [...this.configs, backend]
    validateNetwork(next)
    const proxy = next.find((server) => server.kind === 'velocity')!
    this.assertWritable(proxy.id)
    provisionNetwork(this.root, next)
    saveConfig(this.root, next)
    this.configs = next
    this.metrics[backend.id] = emptyMetrics(false)
    this.playerService.apply(backend.id, this.directory(backend.id))
  }

  removeServer(id: string) {
    const config = this.config(id)
    if (config.kind !== 'paper') throw new PanelError('The Velocity proxy cannot be removed.')
    if (this.configs.filter((server) => server.kind === 'paper').length <= 1) throw new PanelError('Keep at least one Paper backend.')
    this.assertWritable(id)
    const proxy = this.configs.find((server) => server.kind === 'velocity')!
    this.assertWritable(proxy.id)
    const next = this.configs.filter((server) => server.id !== id)
    provisionNetwork(this.root, next)
    saveConfig(this.root, next)
    this.configs = next
    this.manager.processes.delete(id)
    delete this.metrics[id]
    delete this.downloads[id]
    this.usage.delete(id)
    this.playerCounts.delete(id)
    this.agentArgs.delete(id)
  }

  /** Strict gate: the server must be stopped and idle for restarts, settings, EULA, reinstalls, and backups. */
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

  /** Config, plugin, and file writes stay allowed while the server runs; only concurrent writes or a running backup exclude. */
  async withFileWrite<T>(id: string, operation: () => T | Promise<T>): Promise<T> {
    this.config(id)
    if (this.backupJobs.has(id) || this.writeJobs.has(id)) throw new PanelError('Wait for other file operations or backups to finish first.')
    this.writeJobs.add(id)
    try { return await operation() } finally {
      try {
        if (this.config(id).kind === 'paper' && disablePaperWhitelist(this.directory(id)) && this.manager.get(id).child) this.manager.command(id, 'minecraft:whitelist off')
      } finally { this.writeJobs.delete(id) }
    }
  }

  directory(id: string) { return serverDirectory(this.root, this.config(id).workingDirectory) }
  installed(id: string) { const path = safePath(this.directory(id), this.config(id).jarFile); return existsSync(path) && statSync(path).isFile() }
  eulaAccepted(id: string) {
    if (this.config(id).kind !== 'paper') return true
    const path = safePath(this.directory(id), 'eula.txt')
    return existsSync(path) && /^eula\s*=\s*true\s*$/mu.test(readFileSync(path, 'utf8'))
  }

  private checkStart(config: ServerConfig) {
    if (this.backupJobs.has(config.id) || this.writeJobs.has(config.id)) throw new PanelError('Wait for active file operations or backups to finish.')
    this.checkAssets(config)
    if (config.kind === 'paper') this.playerService.apply(config.id, this.directory(config.id))
    if (!this.javaExecutables.has(Number(config.javaVersion.split(' ')[1]))) throw new PanelError('Java has not been prepared for this server.')
  }

  private checkAssets(config: ServerConfig) {
    if (!this.installed(config.id)) throw new PanelError(`Upload ${config.jarFile} in Files before starting this server.`)
    if (!this.eulaAccepted(config.id)) throw new PanelError('Review and accept the Minecraft EULA in Settings before starting Paper.')
    const issue = proxyStartupIssue(config.kind, this.directory(config.id))
    if (issue) throw new PanelError(issue)
    startupArgs(config)
  }

  private async ensureJava(config: ServerConfig) {
    const major = Number(config.javaVersion.split(' ')[1])
    if (this.javaExecutables.has(major)) return
    let job = this.javaJobs.get(major)
    if (!job) {
      const local = managedJava(this.root, major)
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
    this.manager.log(config.id, `[Panel] Preparing Java ${major} in ${resolve(this.root, 'java', `java-${major}`)}.`)
    try { await job.promise }
    catch (error) {
      const message = error instanceof PanelError ? error.message : `Java ${major} installation failed.`
      this.downloads[config.id] = { ...(this.downloads[config.id] ?? { received: 0, total: 0, bytesPerSecond: 0 }), label: `Java ${major}`, phase: 'failed', error: message }
      this.manager.log(config.id, `[Panel] ${message}`)
      throw error
    } finally { job.listeners.delete(listener) }
  }

  private async compatibleJava(config: ServerConfig): Promise<ServerConfig> {
    const path = safePath(this.directory(config.id), config.jarFile)
    const stat = statSync(path), cached = this.jarRequirements.get(path)
    const major = cached && cached.size === stat.size && cached.mtime === stat.mtimeMs && cached.inode === stat.ino ? cached.major : await requiredJava(path)
    this.jarRequirements.set(path, { size: stat.size, mtime: stat.mtimeMs, inode: stat.ino, major })
    if (Number(config.javaVersion.split(' ')[1]) >= major) return config
    const available = javaVersions.map((value) => Number(value.split(' ')[1])).sort((a, b) => a - b).find((value) => value >= major)
    if (!available) throw new PanelError(`This JAR requires Java ${major}, which the panel does not support yet.`)
    const next = { ...config, javaVersion: `Java ${available}` }
    const configs = this.configs.map((server) => server.id === config.id ? next : server)
    saveConfig(this.root, configs)
    this.configs = configs
    this.manager.log(config.id, `[Panel] JAR requires Java ${major}; switching from ${config.javaVersion} to Java ${available}.`)
    return next
  }

  private async prepareAgent(config: ServerConfig) {
    if (!this.enableAgent) return
    if (this.root.includes('=')) throw new PanelError('The data path cannot contain = when attaching the metrics agent.')
    if (!this.agentBuild) {
      this.manager.log(config.id, '[Panel] Preparing internal metrics agent.')
      this.downloads[config.id] = { phase: 'installing', label: 'Metrics agent', received: 0, total: 0, bytesPerSecond: 0 }
      const java = this.javaExecutables.get(Number(config.javaVersion.split(' ')[1]))!
      this.agentBuild = buildAgent(this.root, java, readAgentSources()).catch((error: unknown) => { this.agentBuild = undefined; throw error })
    }
    const jar = await this.agentBuild
    await this.telemetry.start()
    const properties = this.telemetry.configuration(config)
    this.agentArgs.set(config.id, [`-javaagent:${jar}=${properties}`])
    this.downloads[config.id] = { phase: 'complete', label: 'Metrics agent', received: 0, total: 0, bytesPerSecond: 0 }
  }

  private async startEligible() {
    for (const config of [...this.configs].sort((a, b) => Number(a.kind !== 'paper') - Number(b.kind !== 'paper'))) {
      if (config.autoStart && this.installed(config.id) && this.eulaAccepted(config.id)) {
        try { await this.power(config.id, 'Start') } catch (error) { this.manager.log(config.id, `[Panel] Autostart skipped: ${String(error)}`) }
      }
    }
  }

  async power(id: string, action: 'Start' | 'Restart' | 'Stop') {
    let config = this.config(id)
    if (this.backupJobs.has(id) || this.writeJobs.has(id)) throw new PanelError('Wait for active file operations or backups to finish.')
    if (action === 'Stop' || action === 'Restart') await this.manager.stop(config)
    if (action === 'Start' || action === 'Restart') {
      this.checkAssets(config)
      config = await this.withWrite(id, async () => {
        const compatible = await this.compatibleJava(config)
        await this.ensureJava(compatible)
        await this.prepareAgent(compatible)
        return compatible
      })
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
        const source = await reinstallJar({ directory: this.directory(id), jarFile: config.jarFile, project: config.kind, manifest: resolve(this.root, 'installations', `${id}.json`), onProgress: (progress) => { this.downloads[id] = progress } })
        const compatible = await this.compatibleJava(config)
        await this.ensureJava(compatible)
        await this.prepareAgent(compatible)
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
      await Promise.all(this.configs.map(async (config) => {
        const process = this.manager.get(config.id)
        const history = this.metrics[config.id]
        const agent = this.telemetry.latest(config.id)
        const gameVersion = reportedMinecraftVersion(agent)
        const proxyVersion = reportedProxyVersion(agent)
        if (config.kind === 'velocity' && proxyVersion && this.proxyVersions[config.id] !== proxyVersion) {
          this.proxyVersions[config.id] = proxyVersion
          saveJson(resolve(this.root, 'proxy-versions.json'), this.proxyVersions)
        }
        if (config.kind === 'paper' && gameVersion && this.minecraftVersions[config.id] !== gameVersion) {
          this.minecraftVersions[config.id] = gameVersion
          saveJson(resolve(this.root, 'minecraft-versions.json'), this.minecraftVersions)
        }
        if (agent?.players) this.playerService.remember(agent.players)
        if (!process.child?.pid) { this.usage.delete(config.id); this.playerCounts.delete(config.id); appendMetric(history.cpu, 0); appendMetric(history.ram, 0); appendMetric(history.players, 0); if (history.network) appendMetric(history.network, 0); return }
        const usage = processUsage(process.child.pid)
        const previous = this.usage.get(config.id)
        if (usage) {
          const now = Date.now()
          if (agent?.cpu !== undefined) appendMetric(history.cpu, agent.cpu)
          else if (previous) appendMetric(history.cpu, Math.max(0, (usage.ticks - previous.ticks) / this.ticksPerSecond / ((now - previous.at) / 1000) * 100))
          appendMetric(history.ram, usage.rssMiB)
          this.usage.set(config.id, { ticks: usage.ticks, at: now })
        }
        const players = agent?.onlinePlayers !== undefined && agent.maxPlayers !== undefined ? { online: agent.onlinePlayers, max: agent.maxPlayers } : await queryPlayers(Number(config.address.split(':')[1]))
        if (players) { if (agent?.onlinePlayers !== undefined) players.online = agent.onlinePlayers; this.playerCounts.set(config.id, players); appendMetric(history.players, players.online) }
        if (config.kind === 'paper' && process.status === 'Online' && agent?.tps) appendMetric(history.tps, agent.tps[0])
        if (config.kind !== 'paper' && history.network && agent?.networkIn !== undefined) appendMetric(history.network, agent.networkIn / 1024)
      }))
    } catch { /* A process can exit between metric reads. */ }
    finally { this.sampling = false }
  }

  async createBackup(id: string) { await this.backupService.create(id) }
  async deleteBackup(id: string, backupId: string) { await this.backupService.delete(id, backupId) }
  async restoreBackup(id: string, backupId: string) {
    await this.backupService.restore(id, backupId)
    if (this.config(id).kind === 'paper') this.playerService.apply(id, this.directory(id))
  }
  async refreshBackups(id: string) { await this.backupService.refresh(id) }
  saveBackupSchedule(id: string, enabled: boolean, hour: number, retain: number) { this.backupService.schedule(id, enabled, hour, retain) }

  async searchPlugins(id: string, source: PluginProject['source'], query: string) { return searchPlugins(source, query, this.config(id).kind) }
  async pluginVersions(id: string, source: PluginProject['source'], project: string, gameVersion: string) {
    return (await pluginReleases(source, project, gameVersion, this.config(id).kind)).map(({ id, name, gameVersions, dependencies }) => ({ id, name, gameVersions, dependencies }))
  }
  async installPlugin(id: string, source: PluginProject['source'], project: string, version: string, gameVersion: string) {
    const platform = this.config(id).kind
    const actual = platform === 'paper' ? reportedMinecraftVersion(this.telemetry.latest(id)) : source === 'hangar' ? reportedProxyVersion(this.telemetry.latest(id)) : undefined
    if (actual && actual !== gameVersion) throw new PanelError(`The running server reports ${platform === 'paper' ? 'Minecraft' : 'Velocity'} ${actual}. Choose that version.`)
    await this.withFileWrite(id, () => this.pluginService.install(id, this.directory(id), source, project, version, gameVersion, platform))
  }
  async removePlugin(id: string, source: PluginProject['source'], project: string) {
    this.config(id); await this.withFileWrite(id, () => this.pluginService.remove(id, this.directory(id), source, project))
  }

  private playerTargets() {
    const targets = this.configs.filter((s) => s.kind === 'paper')
    for (const server of targets) if (this.writeJobs.has(server.id) || this.backupJobs.has(server.id)) throw new PanelError('Wait for backend file and backup operations to finish.')
    return targets
  }
  async managePlayer(action: PlayerAction, name: string) {
    validatePlayerAction(action, name)
    const player = await this.playerService.identity(name)
    const targets = this.playerTargets()
    if (action === 'kick') {
      const proxy = this.configs.find((server) => server.kind === 'velocity')!
      this.telemetry.kick(proxy.id, player.uuid)
      return
    }
    this.playerService.change(action, player)
    for (const server of targets) {
      this.playerService.apply(server.id, this.directory(server.id))
      if (!this.manager.get(server.id).child) continue
      const command = { ban: `minecraft:ban ${player.name} Banned by network administrator`, unban: `minecraft:pardon ${player.name}` }[action]
      this.manager.command(server.id, command)
    }
  }

  snapshot(url: string): PanelState {
    const request = new URL(url)
    const serverId = request.pathname.split('/').filter(Boolean)[0]
    const filePath = request.searchParams.get('path') ?? ''
    const servers: Server[] = this.configs.map((config) => {
      const item = this.manager.get(config.id), history = this.metrics[config.id], players = this.playerCounts.get(config.id)
      const source = installedSource(resolve(this.root, 'installations', `${config.id}.json`), config.kind, config.jarFile)
      return { ...config, proxyVersion: reportedProxyVersion(this.telemetry.latest(config.id)) ?? this.proxyVersions[config.id], minecraftVersion: reportedMinecraftVersion(this.telemetry.latest(config.id)) ?? this.minecraftVersions[config.id], telemetry: this.telemetry.latest(config.id), startupIssue: proxyStartupIssue(config.kind, this.directory(config.id)), download: this.downloads[config.id] ? { ...this.downloads[config.id] } : undefined, jarVersion: source ? `${source.version} (build ${source.build})` : undefined, installed: this.installed(config.id), eulaAccepted: this.eulaAccepted(config.id), status: item.status, logs: [...item.logs], logOffset: item.logCount - item.logs.length, cpu: history.cpu.length ? `${history.cpu.at(-1)!.toFixed(1)}%` : '—', memory: history.ram.length ? `${history.ram.at(-1)!.toFixed(0)} / ${config.maxMemory} MiB` : `— / ${config.maxMemory} MiB`, players: players ? `${players.online} / ${players.max}` : '—' }
    })
    let files: PanelState['files'] = {}
    if (serverId && this.configs.some((server) => server.id === serverId) && request.pathname.endsWith('/files')) {
      try { files = { [serverId]: listDirectory(this.directory(serverId), filePath) } }
      catch { files = { [serverId]: [] } }
    }
    const proxyPlayers = servers.find((s) => s.kind === 'velocity')?.telemetry?.players
    const networkPlayers = proxyPlayers ? proxyPlayers.map((p) => ({ ...p, serverId: p.serverId ?? 'proxy' })) : servers.filter((s) => s.kind === 'paper').flatMap((s) => (s.telemetry?.players ?? []).map((p) => ({ ...p, serverId: s.id })))
    return { servers, files, filePath, backups: Object.fromEntries(this.configs.map((config) => [config.id, this.backupService.list(config.id)])), metrics: structuredClone(this.metrics), javaVersions,
      backupSchedules: structuredClone(this.backupService.schedules), backupJobs: [...this.backupJobs], s3Enabled: Boolean(this.backupService.s3),
      playerPolicy: structuredClone(this.playerService.policy), networkPlayers, plugins: Object.fromEntries(this.configs.map((s) => [s.id, this.pluginService.list(s.id)])),
    }
  }

  async shutdown() { this.closing = true; clearInterval(this.timer); clearInterval(this.backupTimer); try { await this.backupService.close(); await this.manager.shutdown(this.configs); await this.telemetry.close() } finally { this.releaseLock() } }
}
