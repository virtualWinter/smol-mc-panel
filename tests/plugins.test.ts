import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { Plugins, pluginReleases, searchPlugins } from '../src/server/plugins'

const jar = Buffer.from('PK\x03\x04plugin-bytes')
test('Modrinth installs verify checksums, restrict compatibility, and protect modified files', async () => {
  const root = mkdtempSync('/tmp/opencode/plugin-install-'), original = globalThis.fetch
  let corrupt = false, badHost = false
  try {
    const directory = resolve(root, 'server'); mkdirSync(directory)
    globalThis.fetch = async (input) => {
      const url = String(input)
      if (url.startsWith('https://api.modrinth.com/v2/search')) return Response.json({ hits: [{ project_id: 'demo', title: 'Demo', description: 'Description' }] })
      if (url.startsWith('https://api.modrinth.com/')) return Response.json([
        { id: 'wrong', version_type: 'release', game_versions: ['1.20'], loaders: ['fabric'], files: [] },
        { id: 'v1', name: '1.0', version_type: 'release', game_versions: ['1.21.11'], loaders: ['paper'], files: [{ primary: true, url: badHost ? 'https://example.com/evil.jar' : 'https://cdn.modrinth.com/demo.jar', hashes: { sha512: createHash('sha512').update(jar).digest('hex') } }], dependencies: [{ dependency_type: 'required', project_id: 'dep' }] },
      ])
      assert.equal(url, 'https://cdn.modrinth.com/demo.jar')
      return new Response(Uint8Array.from(corrupt ? Buffer.from('PK\x03\x04wrong') : jar))
    }
    assert.equal((await searchPlugins('modrinth', 'demo'))[0].name, 'Demo')
    const releases = await pluginReleases('modrinth', 'demo', '1.21.11')
    assert.deepEqual(releases.map((v) => v.id), ['v1'])
    assert.deepEqual(releases[0].dependencies, ['dep'])
    const plugins = new Plugins(root)
    await assert.rejects(plugins.install('lobby', directory, 'modrinth', 'demo', 'wrong', '1.21.11'))
    corrupt = true
    await assert.rejects(plugins.install('lobby', directory, 'modrinth', 'demo', 'v1', '1.21.11'), /verification failed/u)
    assert.deepEqual(plugins.list('lobby'), [])
    corrupt = false; badHost = true
    await assert.rejects(plugins.install('lobby', directory, 'modrinth', 'demo', 'v1', '1.21.11'), /host is not allowed/u)
    badHost = false
    await plugins.install('lobby', directory, 'modrinth', 'demo', 'v1', '1.21.11')
    const plugin = plugins.list('lobby')[0], target = resolve(directory, 'plugins', plugin.file)
    assert.deepEqual(readFileSync(target), jar)
    writeFileSync(target, 'user modified')
    assert.throws(() => plugins.remove('lobby', directory, 'modrinth', 'demo'), /modified/u)
    await assert.rejects(plugins.install('lobby', directory, 'modrinth', 'demo', 'v1', '1.21.11'), /changed outside/u)
    writeFileSync(target, jar)
    writeFileSync(resolve(directory, 'plugins/config.yml'), 'keep')
    plugins.remove('lobby', directory, 'modrinth', 'demo')
    assert.equal(existsSync(target), false)
    assert.equal(readFileSync(resolve(directory, 'plugins/config.yml'), 'utf8'), 'keep')
  } finally { globalThis.fetch = original; rmSync(root, { recursive: true, force: true }) }
})
test('Hangar supports checksum-verified Paper releases but rejects external downloads and incompatible versions', async () => {
  const root = mkdtempSync('/tmp/opencode/hangar-install-'), original = globalThis.fetch
  try {
    const directory = resolve(root, 'server'); mkdirSync(directory)
    globalThis.fetch = async (input) => {
      if (String(input).startsWith('https://hangarcdn.papermc.io/')) return new Response(Uint8Array.from(jar))
      return Response.json({ result: ['release', 'external', 'incompatible'].map((name) => ({ name, channel: { name: 'Release' }, platformDependencies: { PAPER: [name === 'incompatible' ? '1.20' : '1.21.11'] }, pluginDependencies: { PAPER: [{ required: true, name: 'Dependency' }] }, downloads: { PAPER: { externalUrl: name === 'external' ? 'https://example.com' : null, downloadUrl: 'https://hangarcdn.papermc.io/demo.jar', fileInfo: { sha256Hash: createHash('sha256').update(jar).digest('hex') } } } })) })
    }
    assert.deepEqual((await pluginReleases('hangar', 'Owner/Demo', '1.21.11')).map((v) => v.id), ['release'])
    const plugins = new Plugins(root)
    await plugins.install('lobby', directory, 'hangar', 'Owner/Demo', 'release', '1.21.11')
    assert.equal(plugins.list('lobby')[0].source, 'hangar')
    await assert.rejects(pluginReleases('hangar', '../../etc', '1.21.11'), /Invalid plugin/u)
  } finally { globalThis.fetch = original; rmSync(root, { recursive: true, force: true }) }
})
