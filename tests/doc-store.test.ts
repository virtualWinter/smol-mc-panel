import assert from 'node:assert/strict'
import test from 'node:test'
import { isPanelKey } from '../src/server/doc-store'

test('only panel-owned documents are mirrored to Postgres', () => {
  // Panel configuration and registries belong in Postgres.
  for (const key of [
    'admin.json',
    'backup-schedules.json',
    'group-order.json',
    'known-players.json',
    'minecraft-versions.json',
    'panel.json',
    'permissions.json',
    'player-policy.json',
    'proxy-versions.json',
    'agents/build.json',
    'installations/proxy.json',
    'permission-clients/tokens.json',
    'permission-groups/lobby.json',
    'permission-plugin/paper.json',
    'permission-servers/server-1.json',
    'plugin-installations/server-1.json',
  ]) assert.equal(isPanelKey(key), true, key)

  // Minecraft and server-owned files stay on disk.
  for (const key of [
    'servers/lobby-01/ops.json',
    'servers/lobby-01/whitelist.json',
    'servers/server-1/world/players/stats/abc.json',
    'backups/network/2026-01-01.json',
    'player-sync/lobby-01.json',
    'java/java-25/release.json',
    'processes.json',
    'unrelated.json',
  ]) assert.equal(isPanelKey(key), false, key)
})
