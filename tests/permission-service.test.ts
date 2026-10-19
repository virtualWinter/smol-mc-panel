import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import test from 'node:test'
import { PermissionService } from '../src/server/permission-service'

const steve = '11111111-1111-1111-1111-111111111111'

test('a server snapshot merges network, group, and server scopes with server winning', () => {
  const root = mkdtempSync('/tmp/opencode/permission-service-')
  try {
    const service = new PermissionService(root)
    service.saveGroup('network', { name: 'default', weight: 0, inherits: [], permissions: [{ node: 'shared.node', value: true }, { node: 'network.node', value: true }] })
    service.saveGroup('group:lobby', { name: 'vip', weight: 10, inherits: [], permissions: [{ node: 'vip.node', value: true }] })
    service.saveUser('group:lobby', { uuid: steve, name: 'Steve', groups: ['vip'], permissions: [] })
    service.saveGroup('server:survival', { name: 'default', weight: 0, inherits: [], permissions: [{ node: 'shared.node', value: false }, { node: 'server.node', value: true }] })

    const grouped = service.serializeForServer({ id: 'survival', group: 'lobby' })
    // The group scope's groups and users reach the server alongside the other scopes.
    assert.ok(grouped.includes('vip.node=1'), grouped)
    assert.ok(grouped.includes(`u ${steve}`), grouped)
    // The default baseline keeps every scope's nodes, with the server scope overriding per node.
    const baseline = grouped.split('\n')[1]
    assert.match(baseline, /network\.node=1/u)
    assert.match(baseline, /server\.node=1/u)
    assert.match(baseline, /shared\.node=0/u)
    assert.doesNotMatch(baseline, /shared\.node=1/u)

    // Without the group, the same server loses the group scope's users and nodes.
    const ungrouped = service.serializeForServer({ id: 'survival' })
    assert.ok(!ungrouped.includes('vip.node=1'), ungrouped)
    assert.ok(!ungrouped.includes(`u ${steve}`), ungrouped)
    assert.ok(ungrouped.includes('network.node=1'), ungrouped)

    // A server outside the group never receives the group scope.
    assert.ok(!service.serializeForServer({ id: 'creative' }).includes('vip.node=1'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a joining player gets a profile that survives reconnects and loads on the proxy and backends', () => {
  const root = mkdtempSync('/tmp/opencode/permission-service-')
  try {
    const service = new PermissionService(root)

    // The first sighting saves a profile; seeing the same player again is a no-op.
    assert.equal(service.trackPlayers([{ name: 'Steve', uuid: steve }]), true)
    assert.equal(service.trackPlayers([{ name: 'Steve', uuid: steve }]), false)
    assert.deepEqual(service.store('network').store.users, [{ uuid: steve, name: 'Steve', groups: [], permissions: {} }])

    // A rank assigned in the editor is kept when the player rejoins under a new name.
    service.saveGroup('network', { name: 'vip', weight: 10, inherits: [], permissions: [{ node: 'vip.fly', value: true }] })
    service.saveUser('network', { uuid: steve, name: 'Steve', groups: ['vip'], permissions: [{ node: 'direct.node', value: true }] })
    assert.equal(service.trackPlayers([{ name: 'Alex', uuid: steve }]), true)
    const user = service.store('network').store.users.find((entry) => entry.uuid === steve)!
    assert.equal(user.name, 'Alex')
    assert.deepEqual(user.groups, ['vip'])
    assert.deepEqual(user.permissions, { 'direct.node': true })

    // The profile reaches both the proxy and every backend, so a reconnect reloads it.
    for (const server of [{ id: 'proxy' }, { id: 'survival' }]) {
      const snapshot = service.serializeForServer(server)
      assert.ok(snapshot.includes(`u ${steve}`), snapshot)
      assert.match(snapshot, /vip\.fly=1/u)
    }

    // Garbage from telemetry never creates a malformed profile.
    assert.equal(service.trackPlayers([{ name: 'bad name', uuid: steve }, { name: 'Steve', uuid: 'not-a-uuid' }]), false)
    assert.equal(service.store('network').store.users.length, 1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
