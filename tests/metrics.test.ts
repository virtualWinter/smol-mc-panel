import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { once } from 'node:events'
import test from 'node:test'
import { appendMetric, processUsage, queryPlayers, varInt } from '../src/server/metrics'

test('player counts use the actual Minecraft status protocol', async () => {
  const server = createServer((socket) => {
    socket.once('data', () => {
      const json = Buffer.from(JSON.stringify({ players: { online: 3, max: 20 } }))
      const packet = Buffer.concat([varInt(0), varInt(json.length), json])
      socket.write(Buffer.concat([varInt(packet.length), packet]))
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    assert.deepEqual(await queryPlayers(address.port), { online: 3, max: 20 })
  } finally { server.close(); await once(server, 'close') }
})

test('metric history is bounded and Linux memory samples come from the real process', () => {
  const history: number[] = []
  for (let index = 0; index < 100; index++) appendMetric(history, index)
  assert.equal(history.length, 60)
  assert.equal(history.at(-1), 99)
  if (process.platform === 'linux') assert.ok(processUsage(process.pid)!.rssMiB > 0)
})
