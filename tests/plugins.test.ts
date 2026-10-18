import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { Plugins, pluginReleases, searchPlugins } from '../src/server/plugins'

const jar = Buffer.from('PK\x03\x04plugin-bytes')
test('empty search browses popular plugins for the selected catalog and server platform', async () => {
  const original = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input)); calls++
      assert.equal(url.searchParams.has('query'), false)
      if (url.hostname === 'api.modrinth.com') {
        assert.equal(url.searchParams.get('index'), 'downloads')
        const facets = JSON.parse(url.searchParams.get('facets')!) as string[][]
        assert.ok(facets.some((values) => values.includes('categories:paper') || values.includes('categories:velocity')))
        return Response.json({ hits: [{ project_id: 'popular', title: 'Popular plugin', description: 'Catalog result' }] })
      }
      assert.equal(url.searchParams.get('sort'), '-downloads')
      assert.ok(['PAPER', 'VELOCITY'].includes(url.searchParams.get('platform')!))
      return Response.json({ result: [{ namespace: { owner: 'Owner', slug: 'Popular' }, name: 'Popular plugin', description: 'Catalog result' }] })
    }
    for (const source of ['modrinth', 'hangar'] as const) {
      for (const platform of ['paper', 'velocity'] as const) {
        assert.equal((await searchPlugins(source, '', platform))[0].name, 'Popular plugin')
        assert.equal((await searchPlugins(source, '   ', platform))[0].name, 'Popular plugin')
      }
    }
    assert.equal(calls, 8)
    await assert.rejects(searchPlugins('modrinth', 'x'), /2–100/u)
    await assert.rejects(searchPlugins('hangar', 'x'.repeat(101)), /2–100/u)
    assert.equal(calls, 8)
  } finally { globalThis.fetch = original }
})
test('Velocity search and installation select Velocity releases and never the Paper artifact', async () => {
  const root = mkdtempSync('/tmp/opencode/velocity-plugin-'), original = globalThis.fetch
  const velocityJar = Buffer.from('PK\x03\x04velocity-only')
  const calls: string[] = []
  try {
    const directory = resolve(root, 'proxy'); mkdirSync(directory)
    globalThis.fetch = async (input) => {
      const url = new URL(String(input)); calls.push(url.href)
      if (url.hostname === 'cdn.modrinth.com' || url.hostname === 'hangarcdn.papermc.io') {
        assert.ok(url.pathname.includes('velocity'), 'must download the proxy artifact')
        return new Response(Uint8Array.from(velocityJar))
      }
      if (url.pathname.endsWith('/search')) {
        assert.ok(url.searchParams.get('facets')?.includes('categories:velocity'))
        return Response.json({ hits: [] })
      }
      if (url.hostname === 'api.modrinth.com') {
        assert.deepEqual(JSON.parse(url.searchParams.get('loaders')!), ['velocity'])
        assert.equal(url.searchParams.has('game_versions'), false, 'Minecraft versions must not be confused with proxy versions')
        return Response.json([
          { id: 'paper', version_type: 'release', loaders: ['paper'], game_versions: ['1.21.11'], files: [] },
          { id: 'velocity', name: 'Proxy release', version_type: 'release', loaders: ['velocity'], game_versions: ['1.21.11'], files: [{ primary: true, url: 'https://cdn.modrinth.com/velocity.jar', hashes: { sha512: createHash('sha512').update(velocityJar).digest('hex') } }], dependencies: [] },
        ])
      }
      if (url.pathname.endsWith('/projects')) { assert.equal(url.searchParams.get('platform'), 'VELOCITY'); return Response.json({ result: [] }) }
      assert.equal(url.searchParams.get('platform'), 'VELOCITY')
      assert.equal(url.searchParams.get('platformVersion'), '4.2.1')
      return Response.json({ result: [{ name: 'both-platforms', channel: { name: 'Release' }, platformDependencies: { PAPER: ['1.21.11'], VELOCITY: ['4.2.1'] }, pluginDependencies: { VELOCITY: [{ required: true, name: 'Proxy dependency' }], PAPER: [{ required: true, name: 'Backend dependency' }] }, downloads: {
        PAPER: { downloadUrl: 'https://hangarcdn.papermc.io/paper.jar', fileInfo: { sha256Hash: '0'.repeat(64) } },
        VELOCITY: { downloadUrl: 'https://hangarcdn.papermc.io/velocity.jar', fileInfo: { sha256Hash: createHash('sha256').update(velocityJar).digest('hex') } },
      } }] })
    }
    await searchPlugins('modrinth', 'demo', 'velocity')
    await searchPlugins('hangar', 'demo', 'velocity')
    const plugins = new Plugins(root)
    await assert.rejects(plugins.install('proxy', directory, 'modrinth', 'demo', 'paper', '', 'velocity'))
    await plugins.install('proxy', directory, 'modrinth', 'demo', 'velocity', '', 'velocity')
    const releases = await pluginReleases('hangar', 'Owner/Demo', '4.2.1', 'velocity')
    assert.deepEqual(releases[0].dependencies, ['Proxy dependency'])
    await plugins.install('proxy', directory, 'hangar', 'Owner/Demo', 'both-platforms', '4.2.1', 'velocity')
    assert.equal(plugins.list('proxy').length, 2)
    for (const plugin of plugins.list('proxy')) assert.deepEqual(readFileSync(resolve(directory, 'plugins', plugin.file)), velocityJar)
    assert.ok(calls.length > 0)
  } finally { globalThis.fetch = original; rmSync(root, { recursive: true, force: true }) }
})
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
