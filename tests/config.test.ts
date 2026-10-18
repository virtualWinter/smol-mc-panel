import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { loadConfig, saveConfig, validateNetwork, validateRelativePath } from '../src/server/config'
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

test('legacy loopback proxies migrate to 0.0.0.0 across panel.json and server config files', () => {
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
    // BungeeCord listeners migrate the same way.
    const bungee = resolve(root, 'servers/bungee')
    mkdirSync(bungee, { recursive: true })
    writeFileSync(resolve(bungee, 'config.yml'), 'listeners:\n  - host: "127.0.0.1:25577"\n    motd: "keep me"\n')
    const bungeeBind = defaults().map((server) => server.kind === 'velocity' ? { ...server, id: 'bungee', kind: 'bungeecord', jarFile: 'bungeecord.jar', address: '127.0.0.1:25577', workingDirectory: 'servers/bungee', stopCommand: 'end' } : server)
    writeFileSync(resolve(root, 'panel.json'), JSON.stringify({ version: 1, servers: bungeeBind }))
    loadConfig(root)
    assert.ok(readFileSync(resolve(bungee, 'config.yml'), 'utf8').includes('host: "0.0.0.0:25577"'))
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
