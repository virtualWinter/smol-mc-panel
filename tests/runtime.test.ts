import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { NetworkRuntime } from '../src/server/runtime'
import { proxyConfig, saveConfig } from '../src/server/config'
import { writeText } from '../src/server/files'
import { defaults } from './helpers'

test('config, plugin, and file writes stay allowed while the server runs; strict operations still require a stop', async () => {
  const root = mkdtempSync('/tmp/opencode/hot-files-runtime-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  try {
    const processes = (runtime as unknown as { manager: { processes: Map<string, Record<string, unknown> & { child?: { pid: number } } > } }).manager.processes
    const proxy = processes.get('proxy') ?? (processes.set('proxy', { status: 'Online', logs: [], logCount: 0, intentionalStop: false, restarts: [] }), processes.get('proxy')!)
    proxy.child = { pid: process.pid }
    // While "running": file/plugin writes go through the relaxed gate.
    mkdirSync(resolve(root, 'servers/proxy/plugins'), { recursive: true })
    writeFileSync(resolve(root, 'servers/proxy/plugins/hot.yml'), 'cold')
    await runtime.withFileWrite('proxy', () => writeText(runtime.directory('proxy'), 'plugins/hot.yml', 'warm'))
    assert.equal(readFileSync(resolve(root, 'servers/proxy/plugins/hot.yml'), 'utf8'), 'warm')
    assert.throws(() => runtime.assertWritable('proxy'), /Stop the server/u)
    await assert.rejects(runtime.createBackup('proxy'), /Stop the server/u)
    // The relaxed gate still serializes against concurrent writes and backups.
    const internal = runtime as unknown as { writeJobs: Set<string> }
    internal.writeJobs.add('proxy')
    await assert.rejects(runtime.withFileWrite('proxy', () => Promise.resolve()), /other file operations/u)
    internal.writeJobs.delete('proxy')
    proxy.child = undefined
    assert.doesNotThrow(() => runtime.assertWritable('proxy'))
    } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})

test('new network generates secure forwarding, requires JARs and EULA, and creates actual archives', async () => {
  const root = mkdtempSync('/tmp/opencode/network-runtime-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  try {
    const snapshot = runtime.snapshot('http://localhost/proxy/files')
    assert.throws(() => new NetworkRuntime(root, false), /already managing/u)
    assert.equal(snapshot.servers.length, 3)
    assert.ok(snapshot.servers.every((server) => server.status === 'Offline' && !server.installed))
    assert.ok(readFileSync(resolve(root, 'servers/proxy/velocity.toml'), 'utf8').includes('player-info-forwarding-mode = "modern"'))
    const secret = readFileSync(resolve(root, 'forwarding.secret'), 'utf8')
    assert.ok(readFileSync(resolve(root, 'servers/survival/config/paper-global.yml'), 'utf8').includes(secret))
    assert.ok(readFileSync(resolve(root, 'servers/survival/server.properties'), 'utf8').includes('server-ip=127.0.0.1'))
    await assert.rejects(runtime.power('survival', 'Start'), /Upload server.jar/u)
    assert.equal(runtime.eulaAccepted('survival'), false)
    writeFileSync(resolve(root, 'servers/survival/server.jar'), 'not executed')
    await assert.rejects(runtime.power('survival', 'Start'), /EULA/u)
    runtime.acceptEula('survival')
    assert.equal(runtime.eulaAccepted('survival'), true)
    runtime.reorder('creative', 'proxy')
    assert.equal(JSON.parse(readFileSync(resolve(root, 'panel.json'), 'utf8')).servers[0].id, 'creative')
    await runtime.createBackup('survival')
    const backup = runtime.snapshot('http://localhost/survival/backups').backups.survival[0]
    assert.ok(backup)
    assert.equal(existsSync(resolve(root, 'backups/survival', `${backup.id}.tar.gz`)), true)
    runtime.deleteBackup('survival', backup.id)
    assert.equal(runtime.snapshot('http://localhost/survival/backups').backups.survival.length, 0)
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})

test('a proxy without backends keeps its empty [servers] table and reports an issue instead of starting', async () => {
  const root = mkdtempSync('/tmp/opencode/empty-network-runtime-')
  saveConfig(root, [proxyConfig()])
  const runtime = new NetworkRuntime(root, false)
  try {
    const state = runtime.snapshot('http://localhost/proxy/files')
    assert.equal(state.servers.length, 1)
    assert.equal(state.servers[0].kind, 'velocity')
    assert.equal(state.servers[0].eulaAccepted, true)
    assert.equal(existsSync(resolve(root, 'servers/survival')), false)
    assert.ok(readFileSync(resolve(root, 'servers/proxy/velocity.toml'), 'utf8').includes('try = []'))
    assert.match(state.servers[0].startupIssue!, /at least one backend/u)
    writeFileSync(resolve(root, 'servers/proxy/velocity.jar'), 'not executed')
    await assert.rejects(runtime.power('proxy', 'Start'), /at least one backend/u)
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})
