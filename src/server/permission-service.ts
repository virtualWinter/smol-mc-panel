import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Permissions } from './permissions'
import { permissionPluginJar, permissionSnapshot, permissionMarker, permissionPlatform } from './permissions'
import { PanelError } from './errors'
import { safePath } from './paths'
import { buildPermissionPlugin, permissionSignature } from './permission-plugin'
import { serializePermissions, storeHasData, type PermissionStore } from '../permission-model'

/** Scopes, in precedence order (highest first): server > group > network. */
export function scopesForServer(server: { id: string; group?: string }): string[] {
  const scopes = [`server:${server.id}`]
  if (server.group?.trim()) scopes.push(`group:${server.group.trim()}`)
  scopes.push('network')
  return scopes
}

export function scopeFile(scope: string): string {
  if (scope === 'network') return 'permissions.json'
  if (scope.startsWith('group:')) return `permission-groups/${scope.slice(6)}.json`
  if (scope.startsWith('server:')) return `permission-servers/${scope.slice(7)}.json`
  throw new PanelError('Unknown permission scope.')
}

export function scopeLabel(scope: string): string {
  if (scope === 'network') return 'Network'
  if (scope.startsWith('group:')) return `Group: ${scope.slice(6)}`
  if (scope.startsWith('server:')) return `Server: ${scope.slice(7)}`
  return scope
}

/** Manages one PermissionStore per scope and computes merged snapshots per server. */
export class PermissionService {
  private stores = new Map<string, Permissions>()
  broadcast?: () => void
  readonly root: string
  constructor(root: string) { this.root = root }

  store(scope: string): Permissions {
    let s = this.stores.get(scope)
    if (!s) {
      // Ensure parent dir exists
      const file = scopeFile(scope)
      const dir = dirname(resolve(this.root, file))
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      s = new Permissions(this.root, file)
      this.stores.set(scope, s)
    }
    return s
  }

  /** All scopes that currently have data. */
  configuredScopes(): string[] { return [...this.stores.keys()].filter((s) => storeHasData(this.store(s).store)) }

  /** Whether any scope has data. */
  get configured(): boolean { return this.configuredScopes().length > 0 || true } // always true now (plugin always installed)

  /** Whether permissions are configured (any scope has data). */
  get hasData(): boolean { return [...this.stores.keys()].some((s) => storeHasData(this.store(s).store)) }

  /** Merged store for a server: applies scopes in precedence order (server > group > network). */
  mergedStore(server: { id: string; group?: string }): PermissionStore {
    const scopes = scopesForServer(server)
    const groups = new Map<string, PermissionStore['groups'][number]>()
    const users = new Map<string, PermissionStore['users'][number]>()
    let defaultGroup = 'default'
    // Iterate from the lowest precedence to the highest so later scopes override earlier ones.
    for (const scope of [...scopes].reverse()) {
      const source = this.store(scope).store
      if (!storeHasData(source)) continue
      for (const group of source.groups) {
        const existing = groups.get(group.name)
        // Merge nodes per key so a higher scope only overrides the entries it defines.
        groups.set(group.name, existing
          ? { name: group.name, weight: group.weight, inherits: [...new Set([...existing.inherits, ...group.inherits])], permissions: { ...existing.permissions, ...group.permissions } }
          : { ...group, inherits: [...group.inherits], permissions: { ...group.permissions } })
      }
      for (const user of source.users) {
        const existing = users.get(user.uuid)
        users.set(user.uuid, existing
          ? { ...user, groups: [...new Set([...existing.groups, ...user.groups])], permissions: { ...existing.permissions, ...user.permissions } }
          : { ...user, groups: [...user.groups], permissions: { ...user.permissions } })
      }
      defaultGroup = source.defaultGroup || defaultGroup
    }
    return { defaultGroup, groups: [...groups.values()], users: [...users.values()] }
  }

  /** Serialized merged snapshot for a server. */
  serializeFor(server: { id: string; group?: string }): string {
    return serializePermissions(this.mergedStore(server))
  }

  serializeForServer(server: { id: string; group?: string }): string {
    return this.serializeFor(server)
  }

  writeSnapshot(directory: string, server: { id: string; group?: string }) {
    const file = safePath(directory, permissionSnapshot)
    const content = this.serializeFor(server)
    if (existsSync(file) && readFileSync(file, 'utf8') === content) return false
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    writeFileSync(`${file}.tmp`, content, { mode: 0o600 })
    renameSync(`${file}.tmp`, file)
    return true
  }

  status(kind: 'velocity' | 'paper', directory: string): 'installed' | 'pending' {
    return this.installed(kind, directory) ? 'installed' : 'pending'
  }

  private installed(kind: 'velocity' | 'paper', directory: string) {
    const jar = safePath(directory, permissionPluginJar), marker = safePath(directory, permissionMarker)
    if (!existsSync(jar) || !existsSync(marker)) return false
    try { return readFileSync(marker, 'utf8').trim() === permissionSignature(permissionPlatform(kind)) } catch { return false }
  }

  async install(kind: 'velocity' | 'paper', directory: string, java: string) {
    const platform = permissionPlatform(kind)
    if (this.installed(kind, directory)) return
    const target = permissionSignature(platform)
    const jar = safePath(directory, permissionPluginJar), marker = safePath(directory, permissionMarker)
    const built = await buildPermissionPlugin(this.root, java, platform)
    mkdirSync(dirname(jar), { recursive: true, mode: 0o700 })
    writeFileSync(`${jar}.tmp`, readFileSync(built), { mode: 0o600 })
    renameSync(`${jar}.tmp`, jar)
    mkdirSync(dirname(marker), { recursive: true, mode: 0o700 })
    writeFileSync(`${marker}.tmp`, `${target}\n`, { mode: 0o600 })
    renameSync(`${marker}.tmp`, marker)
  }

  saveGroup(scope: string, input: any) {
    const r = this.store(scope).saveGroup(input)
    this.broadcast?.()
    return r
  }
  removeGroup(scope: string, name: string) {
    this.store(scope).removeGroup(name)
    this.broadcast?.()
  }
  setDefaultGroup(scope: string, name: string) {
    this.store(scope).setDefaultGroup(name)
    this.broadcast?.()
  }
  saveUser(scope: string, input: any) {
    const r = this.store(scope).saveUser(input)
    this.broadcast?.()
    return r
  }
  removeUser(scope: string, uuid: string) {
    this.store(scope).removeUser(uuid)
    this.broadcast?.()
  }
}
