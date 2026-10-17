import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { bungeeStartupIssue } from '../src/server/proxy-config'

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
