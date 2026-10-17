import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { defaults } from './helpers'
import { ProcessManager } from '../src/server/process-manager'

test('process manager captures ANSI output, writes commands, prevents duplicates, and stops cleanly', async () => {
  const config = { ...defaults()[0], restartOnCrash: false }
  const manager = new ProcessManager({
    directory: () => process.cwd(), beforeStart: () => {}, stopTimeout: 1000,
    launch: () => spawn(process.execPath, ['-e', `
      console.log('\\x1b[32mListening on 127.0.0.1:25565\\x1b[0m');
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (text) => { if (text.trim() === 'shutdown') process.exit(0); else console.log('received: ' + text.trim()); });
    `], { stdio: 'pipe' }),
  })
  try {
    await manager.start(config)
    await assert.rejects(manager.start(config))
    const child = manager.get(config.id).child!
    await once(child.stdout, 'data')
    assert.equal(manager.get(config.id).status, 'Online')
    assert.ok(manager.get(config.id).logs.some((line) => line.includes('\x1b[32m')))
    manager.command(config.id, 'list')
    await once(child.stdout, 'data')
    assert.ok(manager.get(config.id).logs.includes('received: list'))
    assert.throws(() => manager.command(config.id, 'list\nstop'))
    await manager.stop(config)
    assert.equal(manager.get(config.id).status, 'Offline')
    assert.equal(manager.get(config.id).child, undefined)
    await delay(20)
    assert.equal(manager.get(config.id).restartTimer, undefined)
  } finally { await manager.shutdown([config]) }
})

test('crash recovery is capped instead of endlessly respawning a broken server', async () => {
  const config = defaults()[0]
  let launches = 0
  const manager = new ProcessManager({
    directory: () => process.cwd(), beforeStart: () => {}, restartDelay: 5,
    launch: () => { launches++; return spawn(process.execPath, ['-e', 'process.exit(1)'], { stdio: 'pipe' }) },
  })
  try {
    await manager.start(config)
    const timeout = Date.now() + 5000
    while (!manager.get(config.id).logs.some((line) => line.includes('Crash recovery paused')) && Date.now() < timeout) await delay(20)
    assert.equal(launches, 6)
    assert.equal(manager.get(config.id).status, 'Offline')
    assert.equal(manager.get(config.id).restartTimer, undefined)
  } finally { await manager.shutdown([config]) }
})

test('Java compatibility failures do not enter crash-recovery loops', async () => {
  const config = defaults()[0]
  let launches = 0
  const manager = new ProcessManager({
    directory: () => process.cwd(), beforeStart: () => {}, restartDelay: 5,
    launch: () => { launches++; return spawn(process.execPath, ['-e', 'console.error("java.lang.UnsupportedClassVersionError: class file version 69.0"); process.exit(1)'], { stdio: 'pipe' }) },
  })
  try {
    await manager.start(config)
    await once(manager.get(config.id).child!, 'close')
    await delay(30)
    assert.equal(launches, 1)
    assert.equal(manager.get(config.id).restartTimer, undefined)
    assert.ok(manager.get(config.id).logs.some((line) => line.includes('Automatic restarts are disabled')))
  } finally { await manager.shutdown([config]) }
})
