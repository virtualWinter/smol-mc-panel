import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { Backups } from '../src/server/backups'
import type { BackupS3 } from '../src/server/s3'
import { extractBackup } from '../src/server/restore'

function fixture() {
  const root = mkdtempSync('/tmp/opencode/backup-features-'), directory = resolve(root, 'server')
  mkdirSync(directory); writeFileSync(resolve(directory, 'world.txt'), 'original')
  const busy = new Set<string>(), events: string[] = []
  let running = false
  const host = {
    ids: () => ['lobby'], directory: (id: string) => { assert.equal(id, 'lobby'); return directory }, busy,
    assertIdle: () => { if (running || busy.size) throw new Error('Stop first') },
    running: () => running, available: () => !busy.size,
    stop: async () => { events.push('stop'); running = false }, start: async () => { events.push('start'); running = true }, log: (_id: string, message: string) => { events.push(message) },
  }
  return { root, directory, busy, events, host, setRunning: (value: boolean) => { running = value } }
}
test('local restore stages data, keeps the original directory, and rejects restore while running', async () => {
  const f = fixture(), service = new Backups(f.root, f.host, false)
  try {
    await service.create('lobby')
    const backup = service.list('lobby')[0]
    writeFileSync(resolve(f.directory, 'world.txt'), 'changed')
    f.setRunning(true)
    await assert.rejects(service.restore('lobby', backup.id), /Stop first/u)
    f.setRunning(false)
    await service.restore('lobby', backup.id)
    assert.equal(readFileSync(resolve(f.directory, 'world.txt'), 'utf8'), 'original')
    const preserved = readdirSync(f.root).find((n) => n.startsWith('server.before-restore-'))!
    assert.equal(readFileSync(resolve(f.root, preserved, 'world.txt'), 'utf8'), 'changed')
    await assert.rejects(service.restore('lobby', '../escape'), /Invalid backup/u)
    await service.delete('lobby', backup.id)
    assert.equal(service.list('lobby').length, 0)
  } finally { await service.close(); rmSync(f.root, { recursive: true, force: true }) }
})
test('restore refuses links and never extracts their targets', async () => {
  const f = fixture()
  try {
    symlinkSync('/etc/passwd', resolve(f.directory, 'escape'))
    const archive = resolve(f.root, 'unsafe.tar.gz'), stage = resolve(f.root, 'stage')
    mkdirSync(stage)
    execFileSync('tar', ['-czf', archive, '-C', f.directory, '.'])
    await assert.rejects(extractBackup(archive, stage), /Unsafe backup/u)
    assert.deepEqual(readdirSync(stage), [])
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
test('daily S3 schedules stop/restart once per UTC date, retain newest backups, and persist', async () => {
  const f = fixture()
  const remote = new Map<string, { file: string; created: string; bytes: number }>()
  let failed = false
  const s3 = {
    async upload(_id: string, backupId: string, file: string) {
      if (failed) throw new Error('offline')
      const target = resolve(f.root, `${backupId}.s3`); copyFileSync(file, target)
      remote.set(backupId, { file: target, created: new Date(Date.now() + remote.size * 1000).toISOString(), bytes: 100 })
    },
    async list() { return [...remote.entries()].map(([id, info]) => ({ id, ...info })).sort((a, b) => b.created.localeCompare(a.created)) },
    async download(_id: string, id: string, file: string) { copyFileSync(remote.get(id)!.file, file) },
    async delete(_id: string, id: string) { remote.delete(id) },
  } as unknown as BackupS3
  const service = new Backups(f.root, f.host, s3)
  try {
    service.schedule('lobby', true, 4, 1)
    assert.throws(() => service.schedule('lobby', true, 24, 0))
    f.setRunning(true)
    await service.tick(new Date('2026-10-18T03:00:00Z')); assert.equal(remote.size, 0)
    await service.tick(new Date('2026-10-18T04:00:00Z')); assert.equal(remote.size, 1)
    assert.ok(f.events.includes('stop') && f.events.includes('start'))
    await service.tick(new Date('2026-10-18T05:00:00Z')); assert.equal(f.events.filter((e) => e === 'stop').length, 1)
    await service.tick(new Date('2026-10-19T04:00:00Z')); assert.equal(remote.size, 1)
    assert.equal(service.list('lobby')[0].storage, 's3')
    f.setRunning(false)
    const backup = service.list('lobby')[0]
    writeFileSync(resolve(f.directory, 'world.txt'), 'changed')
    await service.restore('lobby', backup.id)
    assert.equal(readFileSync(resolve(f.directory, 'world.txt'), 'utf8'), 'original')
    failed = true; f.setRunning(true)
    await service.tick(new Date('2026-10-20T04:00:00Z'))
    assert.equal(remote.size, 1, 'upload failure must not prune existing remote backups')
    assert.ok(service.schedules.lobby.error?.includes('kept locally'))
    assert.ok(service.list('lobby').some((b) => b.storage === 'local'))
    assert.equal(f.host.running(), true)
    const reloaded = new Backups(f.root, f.host, s3)
    assert.equal(reloaded.schedules.lobby.lastRun, '2026-10-20')
    assert.ok(existsSync(resolve(f.root, 'backup-schedules.json')))
    await reloaded.close()
  } finally { await service.close(); rmSync(f.root, { recursive: true, force: true }) }
})
