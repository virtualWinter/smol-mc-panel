import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { bungeeStartupIssue, velocityStartupIssue } from '../src/server/proxy-config'

test('BungeeCord preflight requires explicit backend addresses and matching listener priorities', () => {
  const root = mkdtempSync('/tmp/opencode/bungee-config-')
  try {
    const config = resolve(root, 'config.yml')
    writeFileSync(config, 'servers: {}\nlisteners: []\n')
    assert.match(bungeeStartupIssue(root)!, /at least one backend/u)
    writeFileSync(config, 'servers:\n  lobby:\n    address: "127.0.0.1:25566"\nlisteners:\n  - priorities: [unknown]\n')
    assert.match(bungeeStartupIssue(root)!, /existing backend names/u)
    writeFileSync(config, 'servers:\n  lobby:\n    address: "127.0.0.1:99999"\nlisteners:\n  - priorities: [lobby]\n')
    assert.match(bungeeStartupIssue(root)!, /valid host:port/u)
    writeFileSync(config, 'servers:\n  lobby:\n    address: "127.0.0.1:25566"\nlisteners:\n  - priorities: [lobby]\n')
    assert.equal(bungeeStartupIssue(root), undefined)
    writeFileSync(config, 'servers: [invalid YAML\n')
    assert.match(bungeeStartupIssue(root)!, /invalid YAML/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Velocity requires explicit forced-host configuration and rejects stale example mappings', () => {
  const root = mkdtempSync('/tmp/opencode/velocity-config-')
  try {
    const path = resolve(root, 'velocity.toml')
    const servers = '[servers]\nlobby = "127.0.0.1:25566"\ntry = ["lobby"]\n'
    writeFileSync(path, servers)
    assert.match(velocityStartupIssue(root)!, /explicit \[forced-hosts\]/u)
    writeFileSync(path, servers + '\n[forced-hosts]\n"factions.example.com" = ["factions"]\n')
    assert.match(velocityStartupIssue(root)!, /factions.example.com/u)
    writeFileSync(path, servers + '\n[forced-hosts]\n')
    assert.equal(velocityStartupIssue(root), undefined)
    writeFileSync(path, servers + '\n[forced-hosts]\n"play.example.com" = "lobby"\n')
    assert.equal(velocityStartupIssue(root), undefined)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
