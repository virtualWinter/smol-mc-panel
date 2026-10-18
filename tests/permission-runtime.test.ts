import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { Permissions } from '../src/server/permissions'
import { NetworkRuntime } from '../src/server/runtime'
import { saveConfig } from '../src/server/config'
import { defaults } from './helpers'

const java = resolve('data/java/java-25/bin/java')
const hasJdk = existsSync(java)

test('permission edits persist and reach every server as a live snapshot', async () => {
  const root = mkdtempSync('/tmp/opencode/permission-runtime-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  try {
    assert.equal(runtime.snapshot('http://localhost/').permissions.users.length, 0)
    assert.ok(runtime.snapshot('http://localhost/').servers.every((server) => server.permissionPlugin === 'off'))
    // Nothing is written before the first permission is configured.
    assert.equal(existsSync(resolve(root, 'servers/proxy/plugins/smol-panel/permissions.txt')), false)

    runtime.savePermissionGroup({ name: 'staff', weight: 10, inherits: [], permissions: [{ node: 'Staff.Node', value: true }] })
    runtime.savePermissionUser({ uuid: '11111111-1111-1111-1111-111111111111', name: 'Steve', groups: ['staff'], permissions: [{ node: 'staff.extra', value: false }] })
    const snapshot = runtime.snapshot('http://localhost/')
    assert.deepEqual(snapshot.permissions.groups.map((group) => group.name), ['default', 'staff'])
    assert.deepEqual(snapshot.permissions.users[0].permissions, { 'staff.extra': false })
    // Every backend and the proxy see the same snapshot; nothing is installed yet.
    for (const id of ['proxy', 'survival', 'creative']) {
      const file = resolve(root, `servers/${id}/plugins/smol-panel/permissions.txt`)
      assert.ok(readFileSync(file, 'utf8').includes('staff.node=1'), `${id} received the snapshot`)
      assert.equal(runtime.snapshot('http://localhost/').servers.find((server) => server.id === id)!.permissionPlugin, 'pending')
    }

    runtime.setDefaultPermissionGroup('staff')
    assert.equal(runtime.snapshot('http://localhost/').permissions.defaultGroup, 'staff')
    assert.throws(() => runtime.removePermissionGroup('staff'), /default group/u)
    runtime.savePermissionGroup({ name: 'mod', weight: 5, inherits: ['staff'], permissions: [] })
    assert.throws(() => runtime.savePermissionGroup({ name: 'staff', weight: 1, inherits: ['mod'], permissions: [] }), /cycle/u)
    assert.throws(() => runtime.savePermissionGroup({ name: 'bad name', weight: 0, inherits: [], permissions: [] }), /Group names/u)
    assert.throws(() => runtime.savePermissionUser({ uuid: 'nope', name: 'x', groups: [], permissions: [] }), /UUID/u)
    assert.throws(() => runtime.savePermissionUser({ uuid: '11111111-1111-1111-1111-111111111111', name: 'x', groups: ['ghost'], permissions: [] }), /Unknown group/u)
    assert.throws(() => runtime.savePermissionGroup({ name: 'perm', weight: 0, inherits: [], permissions: [{ node: 'not a node', value: true }] }), /valid permission node/u)

    runtime.removePermissionGroup('mod')
    assert.deepEqual(runtime.snapshot('http://localhost/').permissions.groups.map((group) => group.name), ['default', 'staff'])
    runtime.removePermissionUser('11111111-1111-1111-1111-111111111111')
    assert.equal(runtime.snapshot('http://localhost/').permissions.users.length, 0)

    // A server added later receives the current snapshot immediately.
    runtime.addServer({ id: 'events', name: 'Events', port: 25568, maxMemory: 2048, javaVersion: 'Java 25' })
    assert.ok(existsSync(resolve(root, 'servers/events/plugins/smol-panel/permissions.txt')))
    runtime.removeServer('events')
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})

test('the permission plugin installs into a server directory and is only rebuilt for new sources', { skip: !hasJdk, timeout: 120_000 }, async () => {
  const root = mkdtempSync('/tmp/opencode/permission-install-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false)
  const service = new Permissions(root)
  try {
    service.saveGroup({ name: 'staff', weight: 1, inherits: [], permissions: [{ node: 'staff.node', value: true }] })
    const directory = runtime.directory('survival')
    assert.equal(service.status('paper', directory), 'pending')
    await service.install('paper', directory, java)
    assert.equal(service.status('paper', directory), 'installed')
    assert.ok(existsSync(resolve(directory, 'plugins/smol-panel.jar')))
    // A restart of the panel process reads the marker back, so the jar is not rebuilt.
    assert.equal(new Permissions(root).status('paper', directory), 'installed')
    // A restored backup whose jar predates the current sources is detected and reinstalled.
    writeFileSync(resolve(directory, 'plugins/smol-panel/plugin.txt'), 'stale\n')
    assert.equal(new Permissions(root).status('paper', directory), 'pending')
    await new Permissions(root).install('paper', directory, java)
    assert.equal(new Permissions(root).status('paper', directory), 'installed')
    // A missing jar is pending even when the marker survived.
    rmSync(resolve(directory, 'plugins/smol-panel.jar'))
    assert.equal(new Permissions(root).status('paper', directory), 'pending')
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})
