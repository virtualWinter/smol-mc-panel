import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlayerIdentity, PlayerPolicy } from '../types'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { safePath } from './paths'
import { disablePaperWhitelist } from './provision'

export type PlayerAction = 'kick' | 'ban' | 'unban'
export const validPlayerName = (name: unknown): name is string => typeof name === 'string' && /^[a-zA-Z0-9_]{1,16}$/u.test(name)
export function validatePlayerAction(action: string, name: string) {
  if (!['kick', 'ban', 'unban'].includes(action) || !validPlayerName(name)) throw new PanelError('Choose a valid player and action. Whitelisting is disabled.')
}
export class Players {
  policy: PlayerPolicy
  private known: Record<string, PlayerIdentity>
  constructor(private root: string) {
    this.policy = readJson(resolve(root, 'player-policy.json'), { active: false, whitelistEnabled: false, banned: [], whitelist: [] })
    if (this.policy.whitelistEnabled || this.policy.whitelistManaged) {
      this.policy.whitelistEnabled = false; this.policy.whitelistManaged = false; this.save()
    }
    this.known = readJson(resolve(root, 'known-players.json'), {})
    mkdirSync(resolve(root, 'player-sync'), { recursive: true, mode: 0o700 })
  }
  remember(players: PlayerIdentity[]) {
    let changed = false
    for (const player of players) {
      if (!validPlayerName(player.name) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(player.uuid)) continue
      const key = player.name.toLowerCase()
      if (this.known[key]?.uuid !== player.uuid || this.known[key]?.name !== player.name) { this.known[key] = { name: player.name, uuid: player.uuid }; changed = true }
    }
    if (changed) saveJson(resolve(this.root, 'known-players.json'), this.known)
  }
  async identity(name: string): Promise<PlayerIdentity> {
    if (!validPlayerName(name)) throw new PanelError('Invalid Minecraft player name.')
    const saved = this.known[name.toLowerCase()] ?? [...this.policy.banned, ...this.policy.whitelist].find((p) => p.name.toLowerCase() === name.toLowerCase())
    if (saved) return saved
    const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new PanelError('Could not resolve this Minecraft account. Try an online or previously seen player.')
    const data = await response.json() as { id?: string; name?: string }
    if (!data.id || !/^[a-f0-9]{32}$/iu.test(data.id) || !validPlayerName(data.name)) throw new PanelError('Invalid Minecraft profile response.')
    const id = data.id.toLowerCase()
    const player = { name: data.name, uuid: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}` }
    this.remember([player]); return player
  }
  change(action: Exclude<PlayerAction, 'kick'>, player: PlayerIdentity) {
    validatePlayerAction(action, player.name)
    this.policy.active = true
    if (action === 'ban') { this.policy.banned = [...this.policy.banned.filter((p) => p.uuid !== player.uuid), player]; this.policy.unbanned = (this.policy.unbanned ?? []).filter((id) => id !== player.uuid) }
    if (action === 'unban') { this.policy.banned = this.policy.banned.filter((p) => p.uuid !== player.uuid); this.policy.unbanned = [...new Set([...(this.policy.unbanned ?? []), player.uuid])] }
    this.save()
  }
  private save() { saveJson(resolve(this.root, 'player-policy.json'), this.policy) }
  apply(id: string, directory: string) {
    disablePaperWhitelist(directory)
    if (!this.policy.active) return
    const metadata = safePath(this.root, `player-sync/${id}.json`)
    const previous = readJson<{ banned: string[]; whitelist: string[] }>(metadata, { banned: [], whitelist: [] })
    for (const [key, filename] of [['banned', 'banned-players.json']] as const) {
      const file = safePath(directory, filename)
      const existing = readJson<(PlayerIdentity & Record<string, unknown>)[]>(file, [])
      if (!Array.isArray(existing)) throw new PanelError(`Invalid ${filename}; fix it before syncing network player rules.`)
      const next = this.policy[key].map((p) => ({ ...p, created: new Date().toISOString(), source: 'Network panel', expires: 'forever', reason: 'Banned by network administrator' }))
      const removed = this.policy.unbanned ?? []
      saveJson(file, [...existing.filter((p) => !previous[key].includes(p.uuid) && !removed.includes(p.uuid) && !next.some((n) => n.uuid === p.uuid)), ...next])
    }
    saveJson(metadata, { ...previous, banned: this.policy.banned.map((p) => p.uuid) })
  }
}
