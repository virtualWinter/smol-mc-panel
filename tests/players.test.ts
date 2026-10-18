import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { Players, validatePlayerAction } from '../src/server/players'

const player = { name: 'Example', uuid: '11111111-1111-1111-1111-111111111111' }
const other = { name: 'Other', uuid: '22222222-2222-2222-2222-222222222222' }
test('global rules persist, preserve unrelated local bans, and sync to offline/new backends', async () => {
  const root = mkdtempSync('/tmp/opencode/player-rules-')
  try {
    const directory = resolve(root, 'backend'); mkdirSync(directory)
    writeFileSync(resolve(directory, 'server.properties'), 'motd=Keep me\nwhite-list=false\n')
    writeFileSync(resolve(directory, 'banned-players.json'), JSON.stringify([other]))
    const players = new Players(root)
    players.apply('lobby', directory)
    assert.equal(readFileSync(resolve(directory, 'banned-players.json'), 'utf8'), JSON.stringify([other]))
    players.remember([player]); assert.deepEqual(await players.identity('example'), player)
    writeFileSync(resolve(directory, 'server.properties'), 'white-list=true\n')
    players.change('ban', player)
    players.apply('lobby', directory)
    assert.ok(readFileSync(resolve(directory, 'server.properties'), 'utf8').includes('white-list=true'), 'banning must not change an existing whitelist setting')
    players.change('whitelist-add', player); players.whitelist(true)
    players.apply('lobby', directory)
    const bans = JSON.parse(readFileSync(resolve(directory, 'banned-players.json'), 'utf8'))
    assert.equal(bans.length, 2)
    assert.ok(readFileSync(resolve(directory, 'server.properties'), 'utf8').includes('white-list=true'))
    const reloaded = new Players(root)
    assert.equal(reloaded.policy.banned[0].uuid, player.uuid)
    reloaded.change('unban', player); reloaded.change('whitelist-remove', player)
    reloaded.apply('lobby', directory)
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'banned-players.json'), 'utf8')), [other])
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'whitelist.json'), 'utf8')), [])
    // An old restored backup must not resurrect a global unban.
    writeFileSync(resolve(directory, 'banned-players.json'), JSON.stringify([player, other]))
    reloaded.apply('new-backend', directory)
    assert.deepEqual(JSON.parse(readFileSync(resolve(directory, 'banned-players.json'), 'utf8')), [other])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
test('player controls reject command injection and unsupported actions', () => {
  for (const name of ['Example\nstop', 'Example ban Other', '../player', '@a', '']) assert.throws(() => validatePlayerAction('ban', name))
  assert.throws(() => validatePlayerAction('op', 'Example'))
  assert.doesNotThrow(() => validatePlayerAction('kick', 'Example_123'))
})
