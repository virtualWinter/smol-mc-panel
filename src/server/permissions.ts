import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { emptyPermissions, inheritsCycle, normalizeGroup, sanitizePermissions, serializePermissions, storeHasData, validGroupName, validPermissionNode, validPermissionUuid, type PermissionStore } from '../permission-model'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { safePath } from './paths'
import { buildPermissionPlugin, permissionSignature, type PermissionPlatform } from './permission-plugin'

export interface PermissionGroupInput { name: string; weight: number; inherits: string[]; permissions: { node: string; value: boolean }[] }
export interface PermissionUserInput { uuid: string; name: string; groups: string[]; permissions: { node: string; value: boolean }[] }

export const permissionPluginJar = 'plugins/smol-panel.jar'
export const permissionSnapshot = 'plugins/smol-panel/permissions.txt'
/** Records which plugin build was copied into a server, so restores cannot leave a stale jar. */
export const permissionMarker = 'plugins/smol-panel/plugin.txt'

/** Where each plugin jar is expected to live. */
export const permissionPlatform = (kind: 'velocity' | 'paper'): PermissionPlatform => kind === 'velocity' ? 'velocity' : 'paper'

const signatures = new Map<string, string>()
/** Memoized: the shipped sources cannot change while the process runs. */
function signature(platform: PermissionPlatform) {
  let value = signatures.get(platform)
  if (!value) { value = permissionSignature(platform); signatures.set(platform, value) }
  return value
}

function toNodes(permissions: { node: string; value: boolean }[] | undefined) {
  const nodes: Record<string, boolean> = {}
  for (const entry of Array.isArray(permissions) ? permissions : []) {
    if (!entry || typeof entry !== 'object') continue
    const node = typeof entry.node === 'string' ? entry.node.trim().toLowerCase() : ''
    if (!validPermissionNode(node)) throw new PanelError(`"${String(entry.node).slice(0, 64)}" is not a valid permission node.`)
    if (typeof entry.value !== 'boolean') throw new PanelError('Each permission needs an allow or deny value.')
    nodes[node] = entry.value
  }
  return nodes
}

/** Groups, users, and the resolved node snapshot every Paper backend and the proxy read. */
export class Permissions {
  store: PermissionStore
  constructor(private root: string) {
    this.store = sanitizePermissions(readJson(resolve(root, 'permissions.json'), emptyPermissions()))
  }

  get configured() { return storeHasData(this.store) }

  private persist() { saveJson(resolve(this.root, 'permissions.json'), this.store) }

  saveGroup(input: PermissionGroupInput) {
    const name = typeof input?.name === 'string' ? normalizeGroup(input.name) : ''
    if (!validGroupName(name)) throw new PanelError('Group names use lowercase letters, digits, "_" and "-", and start with a letter.')
    const weight = Number(input.weight)
    if (!Number.isInteger(weight) || Math.abs(weight) > 1000) throw new PanelError('Group weight must be a whole number between -1000 and 1000.')
    const inherits = [...new Set((Array.isArray(input.inherits) ? input.inherits : []).map(normalizeGroup))]
    for (const parent of inherits) {
      if (parent === name) throw new PanelError('A group cannot inherit itself.')
      if (!this.store.groups.some((group) => group.name === parent)) throw new PanelError(`Unknown group "${parent}".`)
    }
    if (inheritsCycle(this.store.groups, name, inherits)) throw new PanelError('That inheritance would create a cycle between groups.')
    const next = { name, weight, inherits, permissions: toNodes(input.permissions) }
    const index = this.store.groups.findIndex((group) => group.name === name)
    if (index === -1) this.store.groups.push(next)
    else this.store.groups[index] = next
    this.persist()
    return next
  }

  removeGroup(name: string) {
    const group = normalizeGroup(String(name))
    if (group === this.store.defaultGroup) throw new PanelError('Choose another default group before deleting this one.')
    if (!this.store.groups.some((entry) => entry.name === group)) throw new PanelError('Group not found.')
    this.store.groups = this.store.groups.filter((entry) => entry.name !== group).map((entry) => ({ ...entry, inherits: entry.inherits.filter((parent) => parent !== group) }))
    this.store.users = this.store.users.map((user) => ({ ...user, groups: user.groups.filter((entry) => entry !== group) }))
    this.persist()
  }

  setDefaultGroup(name: string) {
    const group = normalizeGroup(String(name))
    if (!this.store.groups.some((entry) => entry.name === group)) throw new PanelError('Group not found.')
    this.store.defaultGroup = group
    this.persist()
  }

  saveUser(input: PermissionUserInput) {
    const uuid = typeof input?.uuid === 'string' ? input.uuid.trim().toLowerCase() : ''
    if (!validPermissionUuid(uuid)) throw new PanelError('A valid player UUID is required.')
    const groups = [...new Set((Array.isArray(input.groups) ? input.groups : []).map(normalizeGroup))]
    for (const group of groups) if (!this.store.groups.some((entry) => entry.name === group)) throw new PanelError(`Unknown group "${group}".`)
    const name = typeof input.name === 'string' ? input.name.slice(0, 32) : ''
    const next = { uuid, name, groups, permissions: toNodes(input.permissions) }
    const index = this.store.users.findIndex((user) => user.uuid === uuid)
    if (index === -1) this.store.users.push(next)
    else this.store.users[index] = next
    this.persist()
    return next
  }

  removeUser(uuid: string) {
    const key = String(uuid).toLowerCase()
    if (!this.store.users.some((user) => user.uuid === key)) throw new PanelError('Player not found.')
    this.store.users = this.store.users.filter((user) => user.uuid !== key)
    this.persist()
  }

  /** Writes the resolved snapshot the plugin reads. Returns true when the file changed. */
  writeSnapshot(directory: string) {
    const file = safePath(directory, permissionSnapshot)
    const content = serializePermissions(this.store)
    if (existsSync(file) && readFileSync(file, 'utf8') === content) return false
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    writeFileSync(`${file}.tmp`, content, { mode: 0o600 })
    renameSync(`${file}.tmp`, file)
    return true
  }

  /** Serialized snapshot, used by the socket channel. */
  serialize() { return serializePermissions(this.store) }

  status(kind: 'velocity' | 'paper', directory: string): 'off' | 'installed' | 'pending' {
    if (!this.configured) return 'off'
    return this.installed(kind, directory) ? 'installed' : 'pending'
  }

  /** True when the server holds the jar built from the sources this panel ships. */
  private installed(kind: 'velocity' | 'paper', directory: string) {
    const jar = safePath(directory, permissionPluginJar), marker = safePath(directory, permissionMarker)
    if (!existsSync(jar) || !existsSync(marker)) return false
    try { return readFileSync(marker, 'utf8').trim() === signature(permissionPlatform(kind)) } catch { return false }
  }

  /** Builds the plugin with the managed JDK and copies it into the server. */
  async install(kind: 'velocity' | 'paper', directory: string, java: string) {
    const platform = permissionPlatform(kind)
    if (this.installed(kind, directory)) return
    const target = signature(platform)
    const jar = safePath(directory, permissionPluginJar), marker = safePath(directory, permissionMarker)
    const built = await buildPermissionPlugin(this.root, java, platform)
    mkdirSync(dirname(jar), { recursive: true, mode: 0o700 })
    writeFileSync(`${jar}.tmp`, readFileSync(built), { mode: 0o600 })
    renameSync(`${jar}.tmp`, jar)
    // Written last: a half-finished install is detected as pending and retried at the next start.
    mkdirSync(dirname(marker), { recursive: true, mode: 0o700 })
    writeFileSync(`${marker}.tmp`, `${target}\n`, { mode: 0o600 })
    renameSync(`${marker}.tmp`, marker)
  }
}
