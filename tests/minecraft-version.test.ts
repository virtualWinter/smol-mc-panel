import assert from 'node:assert/strict'
import test from 'node:test'
import { reportedMinecraftVersion } from '../src/minecraft-version'

test('Minecraft version detection prefers the exact agent field and supports older Paper build strings', () => {
  assert.equal(reportedMinecraftVersion({ minecraftVersion: '26.1.2', serverVersion: '1.21.11-42' }), '26.1.2')
  assert.equal(reportedMinecraftVersion({ serverVersion: 'git-Paper-42 (MC: 1.21.11)' }), '1.21.11')
  assert.equal(reportedMinecraftVersion({ serverVersion: '1.21.11-42-main@abcd (MC: 1.21.11)' }), '1.21.11')
  assert.equal(reportedMinecraftVersion({ serverVersion: '26.1.2-99-snapshot' }), '26.1.2')
  assert.equal(reportedMinecraftVersion({ serverVersion: 'Velocity 4.2.1-SNAPSHOT' }), undefined)
  assert.equal(reportedMinecraftVersion(), undefined)
})
