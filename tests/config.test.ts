import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { loadConfig, saveConfig, validateNetwork, validateRelativePath } from '../src/server/config'
import { provisionNetwork } from '../src/server/provision'
import { defaults } from './helpers'
import { safePath } from '../src/server/paths'
import { startupArgs } from '../src/server/startup'

test('configuration persists order and settings without losing the single proxy', () => {
  const root = mkdtempSync('/tmp/opencode/network-config-')
  try {
    assert.throws(() => loadConfig(root), /first-start setup/u)
    saveConfig(root, defaults())
    const configs = loadConfig(root)
    assert.equal(configs.filter((server) => server.kind === 'velocity').length, 1)
    configs.reverse(); configs[0].name = 'Build server'
    saveConfig(root, configs)
    assert.deepEqual(loadConfig(root), configs)
    assert.equal(JSON.parse(readFileSync(resolve(root, 'panel.json'), 'utf8')).version, 1)
    assert.throws(() => validateNetwork([configs[0]]))
    assert.throws(() => validateNetwork([...configs, configs[0]]))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the proxy always binds a public 0.0.0.0 address while backends stay loopback-only', () => {
  const root = mkdtempSync('/tmp/opencode/network-bind-')
  try {
    const proxy = defaults().find((server) => server.kind === 'velocity')!
    assert.equal(proxy.address, '0.0.0.0:25565')
    assert.throws(() => validateNetwork([{ ...proxy, address: '127.0.0.1:25565' }]), /0\.0\.0\.0/u)
    assert.throws(() => validateNetwork([{ ...proxy, address: '0.0.0.0:80' }]))
    const backend = defaults().find((server) => server.kind === 'paper')!
    assert.throws(() => validateNetwork([proxy, { ...backend, address: '0.0.0.0:25566' }]))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('legacy loopback proxies migrate to 0.0.0.0 across panel.json and the velocity.toml bind line', () => {
  const root = mkdtempSync('/tmp/opencode/network-migrate-')
  try {
    const legacy = defaults().map((server) => server.kind === 'velocity' ? { ...server, address: '127.0.0.1:25565' } : server)
    mkdirSync(resolve(root, 'servers/proxy'), { recursive: true })
    writeFileSync(resolve(root, 'servers/proxy/velocity.toml'), 'config-version = "2.8"\nbind = "127.0.0.1:25565"\nmotd = "keep me"\n')
    writeFileSync(resolve(root, 'panel.json'), JSON.stringify({ version: 1, servers: legacy }))

    const servers = loadConfig(root)
    assert.equal(servers.find((server) => server.kind === 'velocity')!.address, '0.0.0.0:25565')
    assert.deepEqual(loadConfig(root), servers)
    assert.equal(JSON.parse(readFileSync(resolve(root, 'panel.json'), 'utf8')).servers[0].address, '0.0.0.0:25565')
    const toml = readFileSync(resolve(root, 'servers/proxy/velocity.toml'), 'utf8')
    assert.ok(toml.includes('bind = "0.0.0.0:25565"') && toml.includes('motd = "keep me"'))
    // BungeeCord networks were removed and must abort with a clear message instead of half-loading.
    writeFileSync(resolve(root, 'panel.json'), JSON.stringify({ version: 1, servers: legacy.map((server) => server.kind === 'velocity' ? { ...server, kind: 'bungeecord', jarFile: 'bungeecord.jar', stopCommand: 'end' } : server) }))
    assert.throws(() => loadConfig(root), /BungeeCord support was removed/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the proxy backend list is reconciled from panel.json on every boot', () => {
  const root = mkdtempSync('/tmp/opencode/network-sync-')
  try {
    provisionNetwork(root, defaults())
    const toml = () => readFileSync(resolve(root, 'servers/proxy/velocity.toml'), 'utf8')
    assert.ok(toml().includes('survival = "127.0.0.1:25566"') && toml().includes('try = ["survival"]'))
    // An unchanged topology rewrites nothing.
    const before = toml()
    provisionNetwork(root, defaults())
    assert.equal(toml(), before)
    // A user force-host for a kept backend survives; entries for dropped backends go.
    writeFileSync(resolve(root, 'servers/proxy/velocity.toml'), toml().replace('[forced-hosts]', '[forced-hosts]\n"game.example.com" = ["survival"]\n"old.example.com" = ["ghost"]\n'))
    const expanded = [...defaults(), { ...defaults()[1], id: 'events', name: 'Events', address: '127.0.0.1:25568', workingDirectory: 'servers/events' }]
    provisionNetwork(root, expanded)
    let updated = toml()
    assert.ok(updated.includes('events = "127.0.0.1:25568"'))
    assert.ok(updated.includes('creative = "127.0.0.1:25567"'))
    assert.ok(updated.includes('"game.example.com" = ["survival"]') && !updated.includes('old.example.com'))
    assert.ok(updated.includes('try = ["survival"]'))
    // Backends removed from panel.json disappear from the proxy on the next boot.
    provisionNetwork(root, defaults())
    updated = toml()
    assert.ok(!updated.includes('events'))
    assert.ok(updated.includes('"game.example.com" = ["survival"]'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('reconciling the backend list preserves untouched velocity.toml content, including comments', () => {
  const root = mkdtempSync('/tmp/opencode/network-sync-comments-')
  try {
    mkdirSync(resolve(root, 'servers/proxy'), { recursive: true })
    const handTuned = [
      'config-version = "2.9"',
      'bind = "0.0.0.0:25565"',
      'player-info-forwarding-mode = "modern"',
      '# Should Velocity pass the favicon from the backend server?',
      'forced-hosts = {}',
      '',
      '[servers]',
      '\tsurvival = "127.0.0.1:25566"',
      '\tcreative = "127.0.0.1:25567"',
      '\ttry = ["survival"]',
      '',
      '[ping-passthrough]',
      '\t# Should Velocity pass the version number from the backend server?',
      '\tversion = false',
      '',
      '[advanced]',
      '\taccept-proxy-protocol = false',
      '',
    ].join('\n')
    writeFileSync(resolve(root, 'servers/proxy/velocity.toml'), handTuned)
    provisionNetwork(root, [...defaults().slice(0, 2), ...[defaults()[2], { ...defaults()[1], id: 'events', name: 'Events', address: '127.0.0.1:25568', workingDirectory: 'servers/events' }]])
    const updated = readFileSync(resolve(root, 'servers/proxy/velocity.toml'), 'utf8')
    // Managed regions follow panel.json; everything else is byte-for-byte identical.
    assert.ok(updated.includes('events = "127.0.0.1:25568"'))
    assert.ok(updated.includes('# Should Velocity pass the version number from the backend server?'))
    assert.ok(updated.includes('\tversion = false'))
    assert.ok(updated.includes('forced-hosts = {}'))
    assert.ok(updated.includes('bind = "0.0.0.0:25565"'))
    assert.equal(updated.split('\n').filter((line) => line.startsWith('#')).length, 1)
    // Second boot with no changes rewrites nothing, so comments never churn.
    const afterBoot = updated
    provisionNetwork(root, [...defaults().slice(0, 2), ...[defaults()[2], { ...defaults()[1], id: 'events', name: 'Events', address: '127.0.0.1:25568', workingDirectory: 'servers/events' }]])
    assert.equal(readFileSync(resolve(root, 'servers/proxy/velocity.toml'), 'utf8'), afterBoot)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('paths cannot escape the managed root or follow symlinks', () => {
  const root = mkdtempSync('/tmp/opencode/network-path-')
  try {
    for (const path of ['../secret', '/etc/passwd', 'a/../secret', 'a\\secret', 'a//b', '.']) assert.throws(() => validateRelativePath(path))
    writeFileSync(resolve(root, 'safe.txt'), 'safe')
    symlinkSync('/etc', resolve(root, 'outside'))
    symlinkSync('/not-present', resolve(root, 'dangling'))
    assert.throws(() => safePath(root, 'outside/passwd'))
    assert.throws(() => safePath(root, 'dangling/file'))
    assert.equal(safePath(root, 'safe.txt'), resolve(root, 'safe.txt'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('startup commands are argument arrays, never shell scripts', () => {
  const config = defaults()[1]
  assert.deepEqual(startupArgs(config), ['-Xms256M', '-Xmx4096M', '-jar', 'server.jar', 'nogui'])
  assert.throws(() => startupArgs({ ...config, startupCommand: 'sh -c "anything"' }))
  assert.throws(() => startupArgs({ ...config, startupCommand: 'java -jar other.jar' }))
  assert.throws(() => startupArgs({ ...config, startupCommand: 'java -jar {{UNKNOWN}}' }))
  assert.throws(() => startupArgs({ ...config, startupCommand: 'java -jar "unterminated' }))
  assert.deepEqual(startupArgs({ ...config, startupCommand: 'java -jar {{JAR_FILE}} ; touch /tmp/not-a-command' }).slice(-3), [';', 'touch', '/tmp/not-a-command'])
})
