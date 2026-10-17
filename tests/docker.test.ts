import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from 'yaml'

test('Docker packaging matches the application runtime layout', () => {
  const compose = parse(readFileSync('docker-compose.yml', 'utf8')) as { services?: Record<string, Record<string, unknown>>; volumes?: Record<string, unknown> }
  const panel = compose.services?.panel
  assert.ok(panel, 'compose declares the panel service')
  assert.equal(panel.build, '.')
  assert.deepEqual(panel.environment, { PANEL_DATA_DIR: '/data' })
  const volumes = compose.volumes ?? {}
  assert.deepEqual(Object.keys(volumes), ['panel-data'])
  assert.ok(!JSON.stringify(panel.ports).includes('25565:25565'), 'proxy port publishing stays opt-in while listeners bind loopback')

  const dockerfile = readFileSync('Dockerfile', 'utf8')
  assert.match(dockerfile, /FROM node:26-bookworm-slim/u)
  const entry = dockerfile.match(/ENTRYPOINT \["node", "(.+?)"/u)![1]
  assert.ok(existsSync(entry), 'entrypoint binary exists for the built bundle')
  for (const required of ['COPY --from=build /app/dist ', 'COPY --from=build /app/agent ', 'USER node', 'PANEL_DATA_DIR=/data', '"preview"', '--host', '0.0.0.0']) {
    assert.ok(dockerfile.includes(required), `Dockerfile contains ${required}`)
  }
  // The built server resolves agent sources relative to its working directory.
  assert.ok(existsSync('agent/src/cc/arsn/panel/metrics/Agent.java') && existsSync('agent/src/cc/arsn/panel/metrics/Bridge.java'))
  assert.match(readFileSync('package.json', 'utf8'), /"start": "vite preview"/u)
  assert.match(readFileSync('.dockerignore', 'utf8'), /^data$/mu)
})
