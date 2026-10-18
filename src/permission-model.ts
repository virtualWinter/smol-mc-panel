/** Panel-authoritative permission model.
 *
 * This module is pure: it validates the stored shape and turns it into the ordered
 * node list the in-game plugin consumes. The plugin never reads groups, weights, or
 * inheritance — every rule is decided here so there is one implementation to test.
 */

export interface PermissionGroup {
  name: string
  /** Higher weight wins when several groups grant the same node. */
  weight: number
  inherits: string[]
  permissions: Record<string, boolean>
}

export interface PermissionUser {
  uuid: string
  name: string
  groups: string[]
  permissions: Record<string, boolean>
}

export interface PermissionStore {
  defaultGroup: string
  groups: PermissionGroup[]
  users: PermissionUser[]
}

export interface PermissionNode {
  node: string
  value: boolean
}

const groupPattern = /^[a-z][a-z0-9_-]{0,31}$/u
const nodePattern = /^[a-z0-9][a-z0-9.*_:-]{0,127}$/u
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

export const validGroupName = (value: unknown): value is string => typeof value === 'string' && groupPattern.test(value)
export const validPermissionNode = (value: unknown): value is string => typeof value === 'string' && nodePattern.test(value.toLowerCase())
export const validPermissionUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value)

export const normalizeNode = (node: string) => node.toLowerCase()
export const normalizeGroup = (name: string) => name.trim().toLowerCase()

export function emptyPermissions(): PermissionStore {
  return { defaultGroup: 'default', groups: [{ name: 'default', weight: 0, inherits: [], permissions: {} }], users: [] }
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Coerces anything read from disk into a valid store, dropping entries that cannot be repaired.
 * Never throws: a hand-edited file must not take the panel offline. */
export function sanitizePermissions(value: unknown): PermissionStore {
  if (!record(value)) return emptyPermissions()
  const groups: PermissionGroup[] = []
  for (const raw of Array.isArray(value.groups) ? value.groups : []) {
    if (!record(raw)) continue
    const name = typeof raw.name === 'string' ? normalizeGroup(raw.name) : ''
    if (!validGroupName(name) || groups.some((group) => group.name === name)) continue
    const weight = Number(raw.weight)
    const inherits = (Array.isArray(raw.inherits) ? raw.inherits : [])
      .filter((entry): entry is string => typeof entry === 'string')
      .map(normalizeGroup)
      .filter((entry) => validGroupName(entry) && entry !== name)
    groups.push({ name, weight: Number.isInteger(weight) && Math.abs(weight) <= 1000 ? weight : 0, inherits: [...new Set(inherits)], permissions: sanitizeNodes(raw.permissions) })
  }
  if (!groups.some((group) => group.name === 'default')) groups.unshift({ name: 'default', weight: 0, inherits: [], permissions: {} })
  const names = new Set(groups.map((group) => group.name))
  for (const group of groups) group.inherits = group.inherits.filter((entry) => names.has(entry) && !reaches(groups, entry, group.name))
  const defaultGroup = typeof value.defaultGroup === 'string' && names.has(normalizeGroup(value.defaultGroup)) ? normalizeGroup(value.defaultGroup) : 'default'
  const users: PermissionUser[] = []
  for (const raw of Array.isArray(value.users) ? value.users : []) {
    if (!record(raw)) continue
    const uuid = typeof raw.uuid === 'string' ? raw.uuid.toLowerCase() : ''
    if (!validPermissionUuid(uuid) || users.some((user) => user.uuid === uuid)) continue
    const name = typeof raw.name === 'string' ? raw.name.slice(0, 32) : ''
    const userGroups = (Array.isArray(raw.groups) ? raw.groups : [])
      .filter((entry): entry is string => typeof entry === 'string')
      .map(normalizeGroup)
      .filter((entry) => names.has(entry))
    users.push({ uuid, name, groups: [...new Set(userGroups)], permissions: sanitizeNodes(raw.permissions) })
  }
  return { defaultGroup, groups, users }
}

function sanitizeNodes(value: unknown): Record<string, boolean> {
  if (!record(value)) return {}
  const nodes: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(value)) {
    const node = key.toLowerCase()
    if (validPermissionNode(node) && typeof entry === 'boolean') nodes[node] = entry
  }
  return nodes
}

/** True when `from` inherits `target` directly or transitively (used to reject inheritance cycles). */
function reaches(groups: PermissionGroup[], from: string, target: string): boolean {
  const seen = new Set<string>()
  const queue = [from]
  while (queue.length) {
    const name = queue.shift()!
    if (name === target) return true
    if (seen.has(name)) continue
    seen.add(name)
    queue.push(...(groups.find((group) => group.name === name)?.inherits ?? []))
  }
  return false
}

/** Rejects an inheritance edit that would create a loop. */
export function inheritsCycle(groups: PermissionGroup[], name: string, inherits: string[]): boolean {
  const next = groups.map((group) => group.name === name ? { ...group, inherits } : group)
  return inherits.some((entry) => reaches(next, entry, name))
}

function orderedNodes(permissions: Record<string, boolean>): PermissionNode[] {
  const wildcard = (node: string) => node.includes('*')
  return Object.entries(permissions)
    .map(([node, value]) => ({ node: normalizeNode(node), value }))
    // Within one subject the most specific node wins: an exact node before any wildcard,
    // then the longest name, so `a.b` beats `a.*`.
    .sort((a, b) => Number(wildcard(a.node)) - Number(wildcard(b.node)) || b.node.length - a.node.length || a.node.localeCompare(b.node))
}

/** Every group a subject reaches, most authoritative first: weight descending, then name. */
export function subjectGroups(store: PermissionStore, names: string[]): PermissionGroup[] {
  const seen = new Set<string>()
  const queue = [...names]
  while (queue.length) {
    const name = queue.shift()!
    if (seen.has(name)) continue
    seen.add(name)
    queue.push(...(store.groups.find((group) => group.name === name)?.inherits ?? []))
  }
  return [...seen]
    .map((name) => store.groups.find((group) => group.name === name)!)
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
}

/** The ordered node list for one subject. Direct nodes beat every group; groups beat the
 * default group; a higher weight beats a lower one; ties break toward the longer node. */
export function resolvedNodes(store: PermissionStore, uuid?: string): PermissionNode[] {
  const user = uuid ? store.users.find((entry) => entry.uuid === uuid) : undefined
  const groups = subjectGroups(store, user?.groups ?? [])
  const nodes = [...orderedNodes(user?.permissions ?? {})]
  for (const group of groups) nodes.push(...orderedNodes(group.permissions))
  const fallback = store.groups.find((group) => group.name === store.defaultGroup)
  if (fallback && !groups.includes(fallback)) nodes.push(...orderedNodes(fallback.permissions))
  // Only the first entry for a node can ever matter, so later duplicates are dropped.
  const seen = new Set<string>()
  return nodes.filter((entry) => (seen.has(entry.node) ? false : (seen.add(entry.node), true)))
}

/** Resolves a single node the way the plugin will, for previews and tests. */
export function resolveNode(store: PermissionStore, uuid: string | undefined, permission: string): boolean | undefined {
  const query = normalizeNode(permission)
  for (const entry of resolvedNodes(store, uuid)) {
    if (entry.node === query) return entry.value
    if (entry.node === '*') return entry.value
    if (entry.node.endsWith('.*') && query.startsWith(entry.node.slice(0, -1))) return entry.value
  }
  return undefined
}

export function storeHasData(store: PermissionStore): boolean {
  if (store.users.length) return true
  return store.groups.some((group) => Object.keys(group.permissions).length > 0 || group.inherits.length > 0)
}

/** Serializes the resolved node lists the in-game plugin reads.
 *
 * One line per subject, nodes already in priority order. The plugin only walks the list,
 * so all group logic stays in this file. An empty node list is never written: the plugin
 * then falls back to the default line, which is the intended behaviour for a subject with
 * no groups and no direct nodes. */
export function serializePermissions(store: PermissionStore): string {
  const line = (prefix: string, nodes: PermissionNode[]) => `${prefix}${nodes.map((entry) => ` ${entry.node}=${entry.value ? 1 : 0}`).join('')}`
  const fallback = store.groups.find((group) => group.name === store.defaultGroup)
  const defaultNodes = fallback ? orderedNodes(fallback.permissions) : []
  const lines = ['#smol-panel-permissions 1', line('d', defaultNodes)]
  const defaultKey = defaultNodes.map((entry) => `${entry.node}=${entry.value ? 1 : 0}`).join(' ')
  for (const user of store.users) {
    const nodes = resolvedNodes(store, user.uuid)
    const key = nodes.map((entry) => `${entry.node}=${entry.value ? 1 : 0}`).join(' ')
    if (!nodes.length || key === defaultKey) continue
    lines.push(line(`u ${user.uuid}`, nodes))
  }
  return lines.join('\n') + '\n'
}
