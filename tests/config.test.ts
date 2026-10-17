import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { defaults, loadConfig, saveConfig, validateNetwork, validateRelativePath } from '../src/server/config'
import { safePath } from '../src/server/paths'
import { startupArgs } from '../src/server/startup'

test('configuration persists order and settings without losing the single proxy', () => {
  const root = mkdtempSync('/tmp/opencode/network-config-')
  try {
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
