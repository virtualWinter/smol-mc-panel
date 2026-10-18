import assert from 'node:assert/strict'
import test from 'node:test'
import { emptyPermissions, resolveNode, resolvedNodes, sanitizePermissions, serializePermissions, storeHasData, type PermissionStore } from '../src/permission-model'

function store(): PermissionStore {
  return sanitizePermissions({
    defaultGroup: 'default',
    groups: [
      { name: 'default', weight: 0, inherits: [], permissions: { 'default.node': true, 'wild.card.*': true, 'c.*': false, 'c.d': true } },
      { name: 'staff', weight: 10, inherits: ['default'], permissions: { 'staff.node': true, 'sensitive.node': false } },
      { name: 'junior', weight: 5, inherits: [], permissions: { 'sensitive.node': false, 'junior.node': true } },
    ],
    users: [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Steve', groups: ['staff'], permissions: { 'sensitive.node': true } }],
  })
}

test('a fresh store holds only the default group', () => {
  const fresh = emptyPermissions()
  assert.deepEqual(fresh.groups.map((group) => group.name), ['default'])
  assert.equal(fresh.defaultGroup, 'default')
  assert.equal(storeHasData(fresh), false)
  assert.equal(storeHasData(store()), true)
})

test('sanitize drops malformed entries and repairs inherited loops', () => {
  const cleaned = sanitizePermissions({
    defaultGroup: 'missing',
    groups: [{ name: 'Bad Name', weight: 4 }, { name: 'B', weight: 0, inherits: ['C'], permissions: { 'ok.node': true, 'BAD NODE': true, 'denied.node': 3 } }, { name: 'c', weight: 0, inherits: ['b'] }],
    users: [{ uuid: 'not-a-uuid' }, { uuid: '11111111-1111-1111-1111-111111111111', name: 'Steve', groups: ['b', 'ghost'] }],
  })
  assert.equal(cleaned.defaultGroup, 'default')
  assert.deepEqual(cleaned.groups.map((group) => group.name), ['default', 'b', 'c'])
  assert.deepEqual(cleaned.groups.find((group) => group.name === 'b')!.permissions, { 'ok.node': true })
  // One edge of the b <-> c loop is dropped so no cycle survives.
  const b = cleaned.groups.find((group) => group.name === 'b')!, c = cleaned.groups.find((group) => group.name === 'c')!
  assert.ok(!(b.inherits.includes('c') && c.inherits.includes('b')))
  assert.deepEqual(cleaned.users, [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Steve', groups: ['b'], permissions: {} }])
})

test('resolution prefers direct nodes, then heavier groups, then the default group', () => {
  const data = store()
  // A direct player entry beats a deny from the assigned group.
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'sensitive.node'), true)
  // Group nodes and the appended default group both resolve.
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'staff.node'), true)
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'default.node'), true)
  // Full wildcards and prefix wildcards both match.
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'wild.card.anything.here'), true)
  // A longer, more specific node in the same group beats a shorter wildcard.
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'c.d'), true)
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'c.other'), false)
  // Nothing configured stays undefined so the server default applies.
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'unknown.node'), undefined)
  // An unknown player falls back to the default group only.
  assert.equal(resolveNode(data, '22222222-2222-2222-2222-222222222222', 'default.node'), true)
  assert.equal(resolveNode(data, '22222222-2222-2222-2222-222222222222', 'staff.node'), undefined)
})

test('a lighter group never overrides a heavier one', () => {
  const data = sanitizePermissions({
    defaultGroup: 'default',
    groups: [
      { name: 'default', weight: 0, inherits: [], permissions: {} },
      { name: 'high', weight: 20, inherits: [], permissions: { 'rank.node': true, 'shared.*': true } },
      { name: 'low', weight: 1, inherits: [], permissions: { 'rank.node': false, 'shared.thing': false } },
    ],
    users: [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Steve', groups: ['high', 'low'], permissions: {} }],
  })
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'rank.node'), true)
  assert.equal(resolveNode(data, '11111111-1111-1111-1111-111111111111', 'shared.thing'), true)
})

test('the snapshot is one ordered line per subject and skips subjects identical to the default', () => {
  const text = serializePermissions(store())
  const lines = text.trimEnd().split('\n')
  assert.equal(lines[0], '#smol-panel-permissions 1')
  // Exact nodes come first, longest first; wildcards follow.
  assert.equal(lines[1], 'd default.node=1 c.d=1 wild.card.*=1 c.*=0')
  assert.equal(lines.length, 3)
  assert.ok(lines[2].startsWith('u 11111111-1111-1111-1111-111111111111 '))
  assert.ok(lines[2].includes('sensitive.node=1'))
})

test('players whose resolved nodes match the default group get no line at all', () => {
  const data = sanitizePermissions({ defaultGroup: 'default', groups: [{ name: 'default', weight: 0, inherits: [], permissions: { 'a.b': true } }], users: [{ uuid: '11111111-1111-1111-1111-111111111111', name: 'Steve', groups: [] }] })
  assert.equal(serializePermissions(data).trimEnd().split('\n').length, 2)
  assert.equal(resolvedNodes(data, '11111111-1111-1111-1111-111111111111').length, 1)
})
