import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { Players, validatePlayerAction } from '../src/server/players'
import { disablePaperWhitelist, provisionNetwork } from '../src/server/provision'
import { defaults, testDirectory } from './helpers'

const player = { name: 'Example', uuid: '11111111-1111-1111-1111-111111111111' }
const other = { name: 'Other', uuid: '22222222-2222-2222-2222-222222222222' }
test('global rules persist, preserve unrelated local bans, and sync to offline/new backends', async () => {
  const root = mkdtempSync('/tmp/opencode/player-rules-')
  try {
    const directory = resolve(root, 'backend'); mkdirSync(directory)
    writeFileSync(resolve(directory, 'server.properties'), 'motd=Keep me\nwhite-list=false\n')
    writeFileSync(resolve(directory, 'banned-players.json'), JSON.stringify([other]))
    writeFileSync(resolve(directory, 'whitelist.json'), JSON.stringify([player]))
    const players = new Players(root)
    players.apply('lobby', directory)
    assert.equal(readFileSync(resolve(directory, 'banned-players.json'), 'utf8'), JSON.stringify([other]))
    players.remember([player]); assert.deepEqual(await players.identity('example'), player)
    writeFileSync(resolve(directory, 'server.properties'), 'white-list=true\n')
    players.change('ban', player)
    players.apply('lobby', directory)
    assert.ok(readFileSync(resolve(directory, 'server.properties'), 'utf8').includes('white-list=false'))
    const bans = JSON.parse(readFileSync(resolve(directory, 'banned-players.json'), 'utf8'))
    assert.equal(bans.length, 2)
    assert.ok(readFileSync(resolve(directory, 'server.properties'), 'utf8').includes('enforce-whitelist=false'))
    const reloaded = new Players(root)
    assert.equal(reloaded.policy.banned[0].uuid, player.uuid)
    reloaded.change('unban', player)
    reloaded.apply('lobby', directory)
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'banned-players.json'), 'utf8')), [other])
    assert.equal(readFileSync(resolve(directory, 'whitelist.json'), 'utf8'), JSON.stringify([player]), 'inactive whitelist data is preserved')
    // An old restored backup must not resurrect a global unban.
    writeFileSync(resolve(directory, 'banned-players.json'), JSON.stringify([player, other]))
    reloaded.apply('new-backend', directory)
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'banned-players.json'), 'utf8')), [other])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('player controls reject command injection and unsupported actions', () => {
  for (const name of ['Example\nstop', 'Example ban Other', '../player', '@a', '']) assert.throws(() => validatePlayerAction('ban', name))
  assert.throws(() => validatePlayerAction('op', 'Example'))
  assert.throws(() => validatePlayerAction('whitelist-add', 'Example'), /Whitelisting is disabled/u)
  assert.throws(() => validatePlayerAction('whitelist-remove', 'Example'), /Whitelisting is disabled/u)
  assert.doesNotThrow(() => validatePlayerAction('kick', 'Example_123'))
})

test('Paper whitelist is forced off during provisioning and with inactive or legacy player policies', () => {
  const root = mkdtempSync('/tmp/opencode/no-whitelist-')
  try {
    provisionNetwork(root, defaults())
    const directory = resolve(root, testDirectory('survival')), file = resolve(directory, 'server.properties')
    writeFileSync(file, '# Keep this comment\nmotd=Custom\n white-list : true\nwhite-list=true\nenforce-whitelist true\n')
    const players = new Players(root)
    players.apply('survival', directory)
    const text = readFileSync(file, 'utf8')
    assert.ok(text.includes('# Keep this comment\nmotd=Custom\n'))
    assert.equal(text.match(/white-list=false/gu)?.length, 2)
    assert.ok(text.includes('enforce-whitelist=false'))
    disablePaperWhitelist(directory)
    assert.equal(readFileSync(file, 'utf8'), text)
    writeFileSync(resolve(root, 'player-policy.json'), JSON.stringify({ active: true, banned: [], whitelist: [player], whitelistEnabled: true, whitelistManaged: true }))
    const migrated = new Players(root)
    assert.equal(migrated.policy.whitelistEnabled, false)
    assert.deepEqual(migrated.policy.whitelist, [player])
    writeFileSync(file, 'white-list=true\nenforce-whitelist=true\n')
    provisionNetwork(root, defaults())
    assert.equal(readFileSync(file, 'utf8'), 'white-list=false\nenforce-whitelist=false\n')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
