import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { NetworkRuntime } from '../src/server/runtime'
import { proxyConfig, saveConfig } from '../src/server/config'
import { defaults } from './helpers'

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

test('explicit BungeeCord configuration provisions a proxy without inventing backend servers', async () => {
  const root = mkdtempSync('/tmp/opencode/bungeecord-runtime-')
  saveConfig(root, [proxyConfig('bungeecord')])
  const runtime = new NetworkRuntime(root, false)
  try {
    const state = runtime.snapshot('http://localhost/proxy/files')
    assert.equal(state.servers.length, 1)
    assert.equal(state.servers[0].kind, 'bungeecord')
    assert.equal(state.servers[0].eulaAccepted, true)
    assert.equal(existsSync(resolve(root, 'servers/survival')), false)
    assert.equal(existsSync(resolve(root, 'forwarding.secret')), false)
    assert.ok(readFileSync(resolve(root, 'servers/proxy/config.yml'), 'utf8').includes('servers: {}'))
    assert.match(state.servers[0].startupIssue!, /at least one backend/u)
    writeFileSync(resolve(root, 'servers/proxy/bungeecord.jar'), 'not executed')
    await assert.rejects(runtime.power('proxy', 'Start'), /at least one backend/u)
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})
