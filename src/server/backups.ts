import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Backup, BackupSchedule } from '../types'
import { PanelError } from './errors'
import { formatBytes } from './files'
import { readJson, saveJson } from './json-store'
import { BackupS3 } from './s3'
import { extractBackup } from './restore'

const exec = promisify(execFile)
interface Host {
  ids(): string[]
  directory(id: string): string
  assertIdle(id: string): void
  busy: Set<string>
  running(id: string): boolean
  available(id: string): boolean
  stop(id: string): Promise<void>
  start(id: string): Promise<void>
  log(id: string, message: string): void
}

export class Backups {
  readonly schedules: Record<string, BackupSchedule>
  readonly s3?: BackupS3
  private remote: Record<string, Backup[]> = {}
  private tasks = new Set<Promise<unknown>>()
  private refreshing = false
  private closed = false
  constructor(private root: string, private host: Host, storage?: BackupS3 | false) {
    this.schedules = readJson(resolve(root, 'backup-schedules.json'), {})
    if (storage) this.s3 = storage
    else if (storage !== false && process.env.S3_BUCKET) this.s3 = new BackupS3()
  }
  private persist() { saveJson(resolve(this.root, 'backup-schedules.json'), this.schedules) }
  private track<T>(task: Promise<T>): Promise<T> {
    this.tasks.add(task)
    void task.then(() => this.tasks.delete(task), () => this.tasks.delete(task))
    return task
  }
  schedule(id: string, enabled: boolean, hour: number, retain: number) {
    this.host.directory(id)
    if (typeof enabled !== 'boolean' || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(retain) || retain < 1 || retain > 100) throw new PanelError('Choose a UTC hour (0–23) and retention (1–100).')
    this.schedules[id] = { ...this.schedules[id], enabled, hour, retain }
    this.persist()
  }
  list(id: string): Backup[] {
    this.host.directory(id)
    const directory = resolve(this.root, 'backups', id)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const local: Backup[] = readdirSync(directory).filter((n) => /^[a-f0-9-]{36}\.tar\.gz$/u.test(n)).map((n) => {
      const stat = statSync(resolve(directory, n))
      return { id: n.slice(0, -7), name: 'Server backup', created: stat.mtime.toISOString(), size: formatBytes(stat.size), storage: 'local' }
    })
    return [...(this.remote[id] ?? []), ...local.filter((b) => !this.remote[id]?.some((r) => r.id === b.id))].sort((a, b) => b.created.localeCompare(a.created))
  }
  async refresh(id: string) {
    this.host.directory(id)
    if (!this.s3) return
    try { this.remote[id] = (await this.s3.list(id)).map((b) => ({ id: b.id, created: b.created, size: formatBytes(b.bytes), name: 'Server backup', storage: 's3' })) }
    catch { throw new PanelError('Could not list S3 backups. Check storage connectivity and credentials.') }
  }
  private async archive(id: string) {
    const directory = resolve(this.root, 'backups', id)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const backupId = randomUUID(), file = resolve(directory, `${backupId}.tar.gz`)
    try {
      await exec('tar', ['-czf', `${file}.tmp`, '-C', this.host.directory(id), '.'], { timeout: 600_000, maxBuffer: 1024 * 1024 })
      renameSync(`${file}.tmp`, file)
    } catch { rmSync(`${file}.tmp`, { force: true }); throw new PanelError('Backup archive failed. Check disk space and tar availability.') }
    if (this.s3) {
      try {
        await this.s3.upload(id, backupId, file); await this.refresh(id)
        if (!this.remote[id]?.some((backup) => backup.id === backupId)) throw new PanelError('Uploaded object is not yet visible in S3.')
      }
      catch { throw new PanelError('S3 upload failed. The completed backup was kept locally; no retention was applied.') }
      unlinkSync(file)
    }
    return backupId
  }
  create(id: string) { return this.track(this.createInternal(id)) }
  private async createInternal(id: string) {
    if (this.closed) throw new PanelError('Panel is shutting down.')
    this.host.assertIdle(id)
    this.host.busy.add(id)
    try { await this.archive(id) } finally { this.host.busy.delete(id) }
  }
  delete(id: string, backupId: string) { return this.track(this.deleteInternal(id, backupId)) }
  private async deleteInternal(id: string, backupId: string) {
    if (this.closed) throw new PanelError('Panel is shutting down.')
    this.host.directory(id)
    if (this.host.busy.has(id)) throw new PanelError('Wait for the current backup operation.')
    if (!/^[a-f0-9-]{36}$/u.test(backupId)) throw new PanelError('Invalid backup ID.')
    this.host.busy.add(id)
    try { await this.erase(id, backupId) } finally { this.host.busy.delete(id) }
  }
  private async erase(id: string, backupId: string) {
    if (this.s3) await this.s3.delete(id, backupId)
    rmSync(resolve(this.root, 'backups', id, `${backupId}.tar.gz`), { force: true })
    this.remote[id] = (this.remote[id] ?? []).filter((b) => b.id !== backupId)
  }
  restore(id: string, backupId: string) { return this.track(this.restoreInternal(id, backupId)) }
  private async restoreInternal(id: string, backupId: string) {
    if (this.closed) throw new PanelError('Panel is shutting down.')
    this.host.assertIdle(id)
    if (!/^[a-f0-9-]{36}$/u.test(backupId)) throw new PanelError('Invalid backup ID.')
    this.host.busy.add(id)
    const source = this.host.directory(id), stage = `${source}.restore-${randomUUID()}`
    const download = resolve(this.root, 'backups', id, `${backupId}.download`)
    try {
      mkdirSync(stage, { mode: 0o700 })
      let file = resolve(this.root, 'backups', id, `${backupId}.tar.gz`)
      if (!existsSync(file)) {
        if (!this.s3) throw new PanelError('Backup not found.')
        mkdirSync(resolve(this.root, 'backups', id), { recursive: true })
        await this.s3.download(id, backupId, download); file = download
      }
      await extractBackup(file, stage)
      // Keep the original directory for recovery; never delete live world data during restore.
      const previous = `${source}.before-restore-${randomUUID()}`
      renameSync(source, previous)
      try { renameSync(stage, source) } catch (error) { renameSync(previous, source); throw error }
      this.host.log(id, `Restored backup. Previous files kept at ${previous}. Server remains stopped.`)
    } finally {
      rmSync(stage, { recursive: true, force: true }); rmSync(download, { force: true }); this.host.busy.delete(id)
    }
  }
  async tick(now = new Date()) {
    if (this.refreshing || this.closed) return
    this.refreshing = true
    try {
      for (const id of this.host.ids()) {
        const schedule = this.schedules[id]
        if (!schedule?.enabled || now.getUTCHours() < schedule.hour || schedule.lastRun === now.toISOString().slice(0, 10)) continue
        if (!this.host.available(id)) continue
        const task = this.scheduled(id, schedule, now)
        this.tasks.add(task)
        try { await task } finally { this.tasks.delete(task) }
      }
    } finally { this.refreshing = false }
  }
  private async scheduled(id: string, schedule: BackupSchedule, now: Date) {
    const running = this.host.running(id)
    this.host.busy.add(id)
    schedule.lastRun = now.toISOString().slice(0, 10); delete schedule.error; this.persist()
    try {
      if (running) { this.host.log(id, 'Scheduled backup: stopping server for a consistent archive.'); await this.host.stop(id) }
      const newest = await this.archive(id)
      const backups = this.list(id)
      // Object timestamps can have only second precision; always retain the just-created archive.
      const ordered = [...backups.filter((b) => b.id === newest), ...backups.filter((b) => b.id !== newest)]
      for (const backup of ordered.slice(schedule.retain)) await this.erase(id, backup.id)
    } catch (error) { schedule.error = error instanceof PanelError ? error.message : 'Scheduled backup failed; check storage connectivity.'; this.host.log(id, schedule.error) }
    finally {
      this.host.busy.delete(id)
      if (running) { try { await this.host.start(id) } catch { schedule.error = 'Backup finished, but server restart failed. Start it manually.' } }
      this.persist()
    }
  }
  async close() { this.closed = true; await Promise.allSettled([...this.tasks]) }
}
