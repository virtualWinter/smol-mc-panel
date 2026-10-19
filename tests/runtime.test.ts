import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { NetworkRuntime } from '../src/server/runtime'
import { proxyConfig, saveConfig } from '../src/server/config'
import { writeText } from '../src/server/files'
import { defaults, testDirectory } from './helpers'

test('Paper config writes cannot re-enable whitelisting', async () => {
  const root = mkdtempSync('/tmp/opencode/whitelist-config-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  try {
    const file = resolve(runtime.directory('survival'), 'server.properties')
    await runtime.withFileWrite('survival', () => writeText(runtime.directory('survival'), 'server.properties', '# Keep me\nwhite-list=true\nenforce-whitelist=true\n'))
    assert.equal(readFileSync(file, 'utf8'), '# Keep me\nwhite-list=false\nenforce-whitelist=false\n')
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})

test('backends can be created and removed without deleting their files or backups', async () => {
  const root = mkdtempSync('/tmp/opencode/topology-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  const input = { id: 'events', name: 'Events', port: 25568, maxMemory: 2048, javaVersion: 'Java 25' }
  try {
    runtime.addServer(input)
    const eventsDirectory = runtime.directory('events')
    assert.equal(runtime.config('events').address, '127.0.0.1:25568')
    assert.ok(readFileSync(resolve(root, testDirectory('proxy'), 'velocity.toml'), 'utf8').includes('events = "127.0.0.1:25568"'))
    assert.ok(readFileSync(resolve(eventsDirectory, 'eula.txt'), 'utf8').includes('eula=false'))
    assert.equal(existsSync(resolve(eventsDirectory, 'server.jar')), false)
    assert.throws(() => runtime.addServer(input), /already in use/u)
    assert.throws(() => runtime.addServer({ ...input, id: 'collision', port: 25566 }))
    await runtime.createBackup('events')
    runtime.removeServer('events')
    assert.throws(() => runtime.config('events'), /not found/u)
    assert.ok(existsSync(resolve(eventsDirectory, 'eula.txt')))
    assert.ok(existsSync(resolve(root, 'backups/events')))
    assert.ok(!readFileSync(resolve(root, testDirectory('proxy'), 'velocity.toml'), 'utf8').includes('events'))
    // A re-added ID gets a fresh UUID, so it never reuses the preserved directory.
    runtime.addServer(input)
    assert.notEqual(runtime.directory('events'), eventsDirectory)
    assert.ok(existsSync(resolve(eventsDirectory, 'eula.txt')))
    runtime.removeServer('events')
    assert.throws(() => runtime.removeServer('proxy'), /cannot be removed/u)
    runtime.removeServer('creative')
    assert.throws(() => runtime.removeServer('survival'), /at least one/u)
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})

test('config, plugin, and file writes stay allowed while the server runs; strict operations still require a stop', async () => {
  const root = mkdtempSync('/tmp/opencode/hot-files-runtime-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  try {
    const processes = (runtime as unknown as { manager: { processes: Map<string, Record<string, unknown> & { child?: { pid: number } } > } }).manager.processes
    const proxy = processes.get('proxy') ?? (processes.set('proxy', { status: 'Online', logs: [], logCount: 0, intentionalStop: false, restarts: [] }), processes.get('proxy')!)
    proxy.child = { pid: process.pid }
    // While "running": file/plugin writes go through the relaxed gate.
    mkdirSync(resolve(root, testDirectory('proxy'), 'plugins'), { recursive: true })
    writeFileSync(resolve(root, testDirectory('proxy'), 'plugins/hot.yml'), 'cold')
    await runtime.withFileWrite('proxy', () => writeText(runtime.directory('proxy'), 'plugins/hot.yml', 'warm'))
    assert.equal(readFileSync(resolve(root, testDirectory('proxy'), 'plugins/hot.yml'), 'utf8'), 'warm')
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
    assert.ok(readFileSync(resolve(root, testDirectory('proxy'), 'velocity.toml'), 'utf8').includes('player-info-forwarding-mode = "modern"'))
    const secret = readFileSync(resolve(root, 'forwarding.secret'), 'utf8')
    assert.ok(readFileSync(resolve(root, testDirectory('survival'), 'config/paper-global.yml'), 'utf8').includes(secret))
    assert.ok(readFileSync(resolve(root, testDirectory('survival'), 'server.properties'), 'utf8').includes('server-ip=127.0.0.1'))
    await assert.rejects(runtime.power('survival', 'Start'), /Upload server.jar/u)
    assert.equal(runtime.eulaAccepted('survival'), false)
    writeFileSync(resolve(root, testDirectory('survival'), 'server.jar'), 'not executed')
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

test('backends can be added and removed while the proxy runs through a live topology update', async () => {
  const root = mkdtempSync('/tmp/opencode/live-topology-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  try {
    const processes = (runtime as unknown as { manager: { processes: Map<string, Record<string, unknown> & { child?: { pid: number } }> } }).manager.processes
    const proxy = processes.get('proxy') ?? (processes.set('proxy', { status: 'Online', logs: [], logCount: 0, intentionalStop: false, restarts: [] }), processes.get('proxy')!)
    proxy.child = { pid: process.pid }
    const telemetry = (runtime as unknown as { telemetry: { latest: (id: string) => unknown; setServers: (id: string, order: string[], servers: [string, string][]) => void } }).telemetry
    const pushed: [string, string][][] = []
    telemetry.setServers = (_id, _order, servers) => { pushed.push(servers) }

    telemetry.latest = () => ({ proxyControl: true })
    assert.throws(() => runtime.addServer({ id: 'events', name: 'Events', port: 25568, maxMemory: 2048, javaVersion: 'Java 25' }), /Restart the Velocity proxy/u)

    telemetry.latest = () => ({ proxyTopology: true })
    runtime.addServer({ id: 'events', name: 'Events', port: 25568, maxMemory: 2048, javaVersion: 'Java 25' })
    assert.deepEqual(pushed.at(-1)?.map(([id]) => id), ['survival', 'creative', 'events'])
    assert.ok(readFileSync(resolve(root, testDirectory('proxy'), 'velocity.toml'), 'utf8').includes('events = "127.0.0.1:25568"'))

    runtime.removeServer('creative')
    assert.deepEqual(pushed.at(-1)?.map(([id]) => id), ['survival', 'events'])
    assert.ok(!readFileSync(resolve(root, testDirectory('proxy'), 'velocity.toml'), 'utf8').includes('creative'))
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
    const proxyDirectory = runtime.directory('proxy')
    assert.equal(existsSync(resolve(root, testDirectory('survival'))), false)
    assert.ok(readFileSync(resolve(proxyDirectory, 'velocity.toml'), 'utf8').includes('try = []'))
    assert.match(state.servers[0].startupIssue!, /at least one backend/u)
    writeFileSync(resolve(proxyDirectory, 'velocity.jar'), 'not executed')
    await assert.rejects(runtime.power('proxy', 'Start'), /at least one backend/u)
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})
