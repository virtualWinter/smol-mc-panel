import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { acquireLock } from '../src/server/lock'
import { processAlive, processStart, registration } from '../src/server/liveness'
import { NetworkRuntime } from '../src/server/runtime'
import { prepareStorage } from '../src/server/storage'
import { saveConfig } from '../src/server/config'
import { defaults } from './helpers'

const holderStart = processStart(process.pid)!

test("start times identify processes across PID reuse like container restarts", () => {
  assert.equal(processAlive(process.pid, holderStart), true)
  assert.equal(processAlive(99999999, 99999), false)
  // A different process reusing the stored PID number is not the original holder.
  assert.equal(processAlive(process.pid, holderStart - 1), false)
  // Legacy entries without a recorded start stay conservative.
  assert.equal(processAlive(process.pid), true)
  assert.equal(registration({ pid: process.pid, start: holderStart })?.start, holderStart)
  assert.equal(registration(7)?.pid, 7)
  assert.equal(registration({ pid: 0 }), undefined)
  assert.equal(registration(null), undefined)
})

test("stale container locks with PID reuse are released instead of deadlocking startup", () => {
  const root = mkdtempSync('/tmp/opencode/lock-restart-')
  try {
    // Simulate a lock left by a dead container whose PID number was reused.
    writeFileSync(resolve(root, '.panel.lock'), JSON.stringify({ pid: process.pid, start: holderStart - 1, token: 'old' }), { flag: 'wx', mode: 0o600 })
    const release = acquireLock(root)
    assert.equal(JSON.parse(readFileSync(resolve(root, '.panel.lock'), 'utf8')).start, holderStart)
    release()
    assert.equal(existsSync(resolve(root, '.panel.lock')), false)
    // A live holder keeps blocking, and legacy locks keep the old behaviour.
    writeFileSync(resolve(root, '.panel.lock'), JSON.stringify({ pid: process.pid, start: holderStart, token: 'live' }), { mode: 0o600 })
    assert.throws(() => acquireLock(root), /already managing/u)
    writeFileSync(resolve(root, '.panel.lock'), JSON.stringify({ pid: process.pid }), { mode: 0o600 })
    assert.throws(() => acquireLock(root), /already managing/u)
    writeFileSync(resolve(root, '.panel.lock'), 'not json', { mode: 0o600 })
    assert.throws(() => acquireLock(root), /Invalid panel lock/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("survivor registries honor start-time identity when the panel boots", async () => {
  const root = mkdtempSync('/tmp/opencode/registry-restart-')
  saveConfig(root, defaults())
  try {
    // A reused PID number from a previous container is not a survivor.
    writeFileSync(resolve(root, 'processes.json'), JSON.stringify({ survival: { pid: process.pid, start: holderStart - 1 } }), { flag: 'wx', mode: 0o600 })
    const runtime = new NetworkRuntime(root, false, false)
    try {
      // The panel records { pid, start } identities for its managed processes.
      writeFileSync(resolve(root, 'processes.json'), JSON.stringify({ survival: { pid: process.pid, start: holderStart } }), { mode: 0o600 })
    } finally { await runtime.shutdown() }
    assert.throws(() => new NetworkRuntime(root, false, false), /survived a previous panel shutdown/u)
    rmSync(resolve(root, 'processes.json'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test("migration respects start-time identity in legacy lock files", () => {
  const cwd = mkdtempSync('/tmp/opencode/migration-restart-')
  try {
    mkdirSync(resolve(cwd, 'network'))
    writeFileSync(resolve(cwd, 'network/panel.json'), 'configuration')
    // Reused PID with a different start time: the holder is gone, migration proceeds.
    writeFileSync(resolve(cwd, 'network/.panel.lock'), JSON.stringify({ pid: process.pid, start: holderStart - 1 }), { flag: 'wx' })
    writeFileSync(resolve(cwd, 'network/processes.json'), JSON.stringify({ ghost: { pid: process.pid, start: holderStart - 1 } }), { flag: 'wx' })
    prepareStorage(cwd)
    assert.ok(existsSync(resolve(cwd, 'data/panel.json')))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
