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
