import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { InstalledPlugin, PluginProject, PluginRelease } from '../types'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { safePath } from './paths'

type Source = 'modrinth' | 'hangar'
export type PluginPlatform = 'paper' | 'velocity'
const platformCheck = (platform: PluginPlatform) => { if (!['paper', 'velocity'].includes(platform)) throw new PanelError('Unsupported plugin platform.'); return platform }
interface Release extends PluginRelease { url: string; hash: string; algorithm: 'sha512' | 'sha256' }
const agent = 'smol-mc-panel/1.0 (https://github.com/virtualWinter/smol-mc-panel)'
const sourceCheck = (source: string): Source => { if (source !== 'modrinth' && source !== 'hangar') throw new PanelError('Choose Modrinth or Hangar.'); return source }
function identity(source: Source, id: string) {
  sourceCheck(source)
  if (typeof id !== 'string' || id.length > 160 || !(source === 'modrinth' ? /^[a-zA-Z0-9_-]+$/u : /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/u).test(id)) throw new PanelError('Invalid plugin project.')
}
async function request(url: string, limit = 4 * 1024 * 1024): Promise<Buffer> {
  const target = new URL(url)
  if (target.protocol !== 'https:' || target.port || target.username || target.password || !['api.modrinth.com', 'cdn.modrinth.com', 'hangar.papermc.io', 'hangarcdn.papermc.io'].includes(target.hostname)) throw new PanelError('Plugin download host is not allowed.')
  const response = await fetch(url, { headers: { 'User-Agent': agent }, redirect: 'error', signal: AbortSignal.timeout(60_000) })
  if (!response.ok || !response.body) throw new PanelError(`Plugin service request failed (${response.status}).`)
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw new PanelError('Plugin response exceeds the size limit.')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}
// Catalog schemas are validated at the fields we consume; catalog text is never executed.
async function json(url: string) { return JSON.parse((await request(url)).toString('utf8')) }
export async function searchPlugins(source: Source, query: string, platform: PluginPlatform = 'paper'): Promise<PluginProject[]> {
  platformCheck(platform)
  sourceCheck(source)
  if (typeof query !== 'string' || query.length > 100 || query.trim().length === 1) throw new PanelError('Enter 2–100 search characters, or leave search empty to browse popular plugins.')
  query = query.trim()
  if (source === 'modrinth') {
    const data = await json(`https://api.modrinth.com/v2/search?limit=10&${query ? `query=${encodeURIComponent(query)}` : 'index=downloads'}&facets=${encodeURIComponent(JSON.stringify([['project_type:plugin'], [`categories:${platform}`]]))}`)
    return (data.hits ?? []).slice(0, 10).map((p: Record<string, string>) => ({ source, id: p.project_id, name: String(p.title).slice(0, 160), description: String(p.description).slice(0, 500) }))
  }
  const data = await json(`https://hangar.papermc.io/api/v1/projects?limit=10&${query ? `query=${encodeURIComponent(query)}` : 'sort=-downloads'}&platform=${platform.toUpperCase()}`)
  return (data.result ?? []).slice(0, 10).map((p: { namespace: { owner: string; slug: string }; name: string; description: string }) => ({ source, id: `${p.namespace.owner}/${p.namespace.slug}`, name: String(p.name).slice(0, 160), description: String(p.description).slice(0, 500) }))
}
export async function pluginReleases(source: Source, project: string, gameVersion: string, platform: PluginPlatform = 'paper'): Promise<Release[]> {
  platformCheck(platform)
  identity(source, project)
  if (!(platform === 'velocity' && source === 'modrinth') && (typeof gameVersion !== 'string' || !/^[0-9][0-9a-zA-Z.+_-]{1,39}$/u.test(gameVersion))) throw new PanelError(platform === 'velocity' ? 'Enter the Velocity version, for example 3.4.0.' : 'Enter the exact Minecraft version, for example 1.21.11.')
  if (source === 'modrinth') {
    const versions = await json(`https://api.modrinth.com/v2/project/${encodeURIComponent(project)}/version?loaders=${encodeURIComponent(JSON.stringify([platform]))}${platform === 'paper' ? `&game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}` : ''}`)
    return versions.filter((v: { version_type: string; game_versions?: string[]; loaders?: string[] }) => v.version_type === 'release' && (platform === 'velocity' || v.game_versions?.includes(gameVersion)) && v.loaders?.includes(platform)).slice(0, 20).flatMap((v: { id: string; name: string; game_versions: string[]; files: { primary: boolean; url: string; hashes: { sha512: string } }[]; dependencies: { dependency_type: string; project_id: string }[] }) => {
      const file = v.files.find((f) => f.primary) ?? v.files[0]
      if (!file || !/^[a-f0-9]{128}$/u.test(file.hashes.sha512)) return []
      return [{ id: v.id, name: v.name, gameVersions: v.game_versions, dependencies: (v.dependencies ?? []).filter((d) => d.dependency_type === 'required').map((d) => d.project_id || 'Required dependency'), url: file.url, hash: file.hashes.sha512, algorithm: 'sha512' as const }]
    })
  }
  const key = platform.toUpperCase()
  const data = await json(`https://hangar.papermc.io/api/v1/projects/${project.split('/').map(encodeURIComponent).join('/')}/versions?limit=25&platform=${key}&platformVersion=${encodeURIComponent(gameVersion)}&channel=Release`)
  return (data.result ?? []).flatMap((v: { name: string; channel: { name: string }; platformDependencies: Record<string, string[]>; downloads: Record<string, { externalUrl?: string; downloadUrl: string; fileInfo?: { sha256Hash: string } }>; pluginDependencies: Record<string, { required: boolean; name: string }[]> }) => {
    const file = v.downloads[key]
    if (!file || file.externalUrl || !file.fileInfo || v.channel.name.toLowerCase() !== 'release' || !v.platformDependencies[key]?.includes(gameVersion) || !/^[a-f0-9]{64}$/u.test(file.fileInfo.sha256Hash)) return []
    return [{ id: v.name, name: v.name, gameVersions: v.platformDependencies[key], dependencies: (v.pluginDependencies[key] ?? []).filter((d) => d.required).map((d) => d.name), url: file.downloadUrl, hash: file.fileInfo.sha256Hash, algorithm: 'sha256' as const }]
  }).slice(0, 20)
}
export class Plugins {
  constructor(private root: string) { mkdirSync(resolve(root, 'plugin-installations'), { recursive: true, mode: 0o700 }) }
  private manifest(id: string) { return safePath(this.root, `plugin-installations/${id}.json`) }
  list(id: string): InstalledPlugin[] { return readJson(this.manifest(id), []) }
  async install(id: string, directory: string, source: Source, project: string, releaseId: string, gameVersion: string, platform: PluginPlatform = 'paper') {
    identity(source, project)
    const release = (await pluginReleases(source, project, gameVersion, platform)).find((v) => v.id === releaseId)
    if (!release) throw new PanelError('That compatible release is no longer available. Search again.')
    const installed = this.list(id), old = installed.find((p) => p.source === source && p.project === project)
    const filename = old?.file ?? `panel-${source}-${createHash('sha256').update(project).digest('hex').slice(0, 16)}.jar`
    mkdirSync(safePath(directory, 'plugins'), { recursive: true })
    const target = safePath(directory, `plugins/${filename}`)
    if (existsSync(target) && (!old || createHash('sha256').update(readFileSync(target)).digest('hex') !== old.sha256)) throw new PanelError('Plugin JAR was changed outside the panel. Move it manually before replacing it.')
    const bytes = await request(release.url, 128 * 1024 * 1024)
    if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50 || createHash(release.algorithm).update(bytes).digest('hex') !== release.hash) throw new PanelError('Plugin checksum or JAR verification failed.')
    const temporary = `${target}.${randomUUID()}.tmp`
    const next: InstalledPlugin = { source, project, version: release.id, name: project, file: filename, sha256: createHash('sha256').update(bytes).digest('hex'), gameVersion }
    try {
      writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 })
      renameSync(temporary, target)
      saveJson(this.manifest(id), [...installed.filter((p) => p !== old), next])
    } finally { rmSync(temporary, { force: true }) }
  }
  remove(id: string, directory: string, source: Source, project: string) {
    identity(source, project)
    const installed = this.list(id), plugin = installed.find((p) => p.source === source && p.project === project)
    if (!plugin) throw new PanelError('Plugin is not managed by the panel.')
    const file = safePath(directory, `plugins/${plugin.file}`)
    if (existsSync(file)) {
      if (createHash('sha256').update(readFileSync(file)).digest('hex') !== plugin.sha256) throw new PanelError('Plugin JAR was modified; remove it manually in Files.')
      rmSync(file)
    }
    saveJson(this.manifest(id), installed.filter((p) => p !== plugin))
  }
}
