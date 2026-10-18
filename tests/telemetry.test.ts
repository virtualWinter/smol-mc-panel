import assert from 'node:assert/strict'
import { connect } from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { TelemetryCollector } from '../src/server/telemetry'
import { defaults } from './helpers'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('proxy disconnect messages are UUID-only, authenticated, and tied to the current process', async () => {
  const root = mkdtempSync('/tmp/opencode/proxy-control-')
  let pid = process.pid
  const collector = new TelemetryCollector(root, () => pid)
  const config = defaults()[0], uuid = '11111111-1111-1111-1111-111111111111'
  async function exchange(data: object) {
    return new Promise<string>((done, reject) => {
      const socket = connect(collector.socketPath)
      let response = ''
      socket.on('error', reject); socket.on('data', (chunk) => { response += chunk })
      socket.on('end', () => done(response))
      socket.on('connect', () => socket.write(JSON.stringify(data) + '\n'))
    })
  }
  try {
    collector.configuration(config)
    const token = readFileSync(resolve(root, 'agents/proxy.properties'), 'utf8').match(/token=([0-9a-f]+)/u)![1]
    await collector.start()
    const sample = { version: 1, serverId: 'proxy', token, pid, heapUsed: 1, heapMax: 2, heapCommitted: 1, uptime: 1, threads: 1, javaVersion: '25', minecraftVersion: '26.1.2', proxyControl: true, players: [{ name: 'Example', uuid, ping: 20, serverId: 'survival' }] }
    assert.throws(() => collector.kick('proxy', uuid), /Restart/u)
    await exchange(sample)
    assert.equal(collector.latest('proxy')?.minecraftVersion, '26.1.2')
    assert.equal(collector.latest('proxy')?.players?.[0].serverId, 'survival')
    assert.throws(() => collector.kick('proxy', 'Example\nstop'), /UUID/u)
    collector.kick('proxy', uuid)
    assert.equal(await exchange({ ...sample, token: '0'.repeat(64) }), '')
    assert.equal(await exchange(sample), `kick ${uuid}\n`)
    assert.equal(await exchange(sample), '')
    collector.kick('proxy', uuid)
    pid++
    assert.equal(await exchange({ ...sample, pid }), '', 'old-process messages must not reach a restarted proxy')
  } finally { await collector.close(); rmSync(root, { recursive: true, force: true }) }
})

function frame(collector: TelemetryCollector, data: object) {
  return new Promise<void>((done, fail) => {
    const socket = connect(collector.socketPath)
    socket.on('error', fail)
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(data)}\n`, (error) => { socket.end(); if (error) fail(error); else done() })
    })
  })
}

test('the telemetry socket authenticates agents for the right process and rejects others', async () => {
  const root = mkdtempSync('/tmp/opencode/telemetry-')
  const collector = new TelemetryCollector(root, (id) => (id === 'survival' ? process.pid : undefined))
  try {
    const config = defaults().find((server) => server.kind === 'paper')!
    collector.configuration(config)
    const properties = readFileSync(resolve(root, 'agents', `${config.id}.properties`), 'utf8')
    const token = properties.match(/token=([0-9a-f]+)/u)![1]
    await collector.start()
    assert.ok(collector.socketPath.endsWith('metrics.sock'))
    const sample = { version: 1, serverId: config.id, token, pid: process.pid, heapUsed: 104857600, heapMax: 1073741824, heapCommitted: 524288000, uptime: 30000, threads: 42, javaVersion: '25.0.1', cpu: 37.5, tps: [20, 19.99, 19.98], mspt: 12.5, onlinePlayers: 3, maxPlayers: 100, serverVersion: '1.21.10', players: [{ name: 'Herobrine', uuid: '0000', ping: 12 }], worlds: [{ name: 'world', players: 3, entities: 120, chunks: 400 }] }
    await frame(collector, sample)
    const check = async (expected: number | undefined) => {
      await delay(100)
      assert.equal(collector.latest(config.id)?.heapUsed, expected)
    }
    await check(104857600)
    const received = collector.latest(config.id)!
    assert.equal(received.cpu, 37.5)
    assert.deepEqual(received.tps, [20, 19.99, 19.98])
    assert.equal(received.mspt, 12.5)
    assert.equal(received.onlinePlayers, 3)
    assert.equal(received.players![0].name, 'Herobrine')
    assert.equal(received.worlds![0].chunks, 400)

    // Established the baseline with a marker value the rejected frames try to replace.
    await frame(collector, { ...sample, heapUsed: 555 })
    await check(555)
    // Wrong token, wrong pid, and unknown servers must not overwrite metrics.
    await frame(collector, { ...sample, heapUsed: 777, token: token.slice(0, -1) })
    await check(555)
    await frame(collector, { ...sample, heapUsed: 777, pid: 999999 })
    await check(555)
    await frame(collector, { ...sample, heapUsed: 777, serverId: 'intruder' })
    await check(555)
    await frame(collector, { ...sample, heapUsed: 777, version: 2 })
    await check(555)
    // Invalid optional fields are dropped rather than poisoning the whole record.
    await frame(collector, { ...sample, heapUsed: 777, tps: [40] })
    await check(777)
    assert.equal(collector.latest(config.id)!.tps, undefined)
    await frame(collector, { ...sample, heapUsed: 777, players: [{ name: '', uuid: '0000', ping: 12 }] })
    await check(777)
    assert.equal(collector.latest(config.id)!.players?.length, 0)
    // Proxy byte rates are accepted, and malformed rates are dropped.
    await frame(collector, { ...sample, heapUsed: 777, networkIn: 51200, networkOut: 102400 })
    await check(777)
    assert.equal(collector.latest(config.id)!.networkOut, 102400)
    await frame(collector, { ...sample, heapUsed: 777, networkIn: -1, networkOut: 2e9 })
    await check(777)
    assert.equal(collector.latest(config.id)!.networkOut, undefined)
    await check(777)
    assert.equal(collector.latest('intruder'), undefined)
    // Processes the panel is not running report no telemetry.
    assert.equal(collector.latest('proxy'), undefined)
  } finally { await collector.close(); rmSync(root, { recursive: true, force: true }) }
})
