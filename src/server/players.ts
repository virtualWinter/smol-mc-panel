import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlayerIdentity, PlayerPolicy } from '../types'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'
import { safePath } from './paths'

export type PlayerAction = 'kick' | 'ban' | 'unban' | 'whitelist-add' | 'whitelist-remove'
export const validPlayerName = (name: unknown): name is string => typeof name === 'string' && /^[a-zA-Z0-9_]{1,16}$/u.test(name)
export function validatePlayerAction(action: string, name: string) {
  if (!['kick', 'ban', 'unban', 'whitelist-add', 'whitelist-remove'].includes(action) || !validPlayerName(name)) throw new PanelError('Choose a valid player and action.')
}
export class Players {
  policy: PlayerPolicy
  private known: Record<string, PlayerIdentity>
  constructor(private root: string) {
    this.policy = readJson(resolve(root, 'player-policy.json'), { active: false, whitelistEnabled: false, banned: [], whitelist: [] })
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
    this.policy.active = true
    if (action === 'ban') { this.policy.banned = [...this.policy.banned.filter((p) => p.uuid !== player.uuid), player]; this.policy.unbanned = (this.policy.unbanned ?? []).filter((id) => id !== player.uuid) }
    if (action === 'unban') { this.policy.banned = this.policy.banned.filter((p) => p.uuid !== player.uuid); this.policy.unbanned = [...new Set([...(this.policy.unbanned ?? []), player.uuid])] }
    if (action === 'whitelist-add') { this.policy.whitelist = [...this.policy.whitelist.filter((p) => p.uuid !== player.uuid), player]; this.policy.whitelistRemoved = (this.policy.whitelistRemoved ?? []).filter((id) => id !== player.uuid) }
    if (action === 'whitelist-remove') { this.policy.whitelist = this.policy.whitelist.filter((p) => p.uuid !== player.uuid); this.policy.whitelistRemoved = [...new Set([...(this.policy.whitelistRemoved ?? []), player.uuid])] }
    this.save()
  }
  whitelist(enabled: boolean) {
    if (typeof enabled !== 'boolean') throw new PanelError('Invalid whitelist setting.')
    this.policy.active = true; this.policy.whitelistManaged = true; this.policy.whitelistEnabled = enabled; this.save()
  }
  private save() { saveJson(resolve(this.root, 'player-policy.json'), this.policy) }
  apply(id: string, directory: string) {
    if (!this.policy.active) return
    const metadata = safePath(this.root, `player-sync/${id}.json`)
    const previous = readJson<{ banned: string[]; whitelist: string[] }>(metadata, { banned: [], whitelist: [] })
    for (const [key, filename] of [['banned', 'banned-players.json'], ['whitelist', 'whitelist.json']] as const) {
      const file = safePath(directory, filename)
      const existing = readJson<(PlayerIdentity & Record<string, unknown>)[]>(file, [])
      if (!Array.isArray(existing)) throw new PanelError(`Invalid ${filename}; fix it before syncing network player rules.`)
      const next = this.policy[key].map((p) => key === 'banned' ? { ...p, created: new Date().toISOString(), source: 'Network panel', expires: 'forever', reason: 'Banned by network administrator' } : p)
      const removed = key === 'banned' ? this.policy.unbanned ?? [] : this.policy.whitelistRemoved ?? []
      saveJson(file, [...existing.filter((p) => !previous[key].includes(p.uuid) && !removed.includes(p.uuid) && !next.some((n) => n.uuid === p.uuid)), ...next])
    }
    if (this.policy.whitelistManaged) {
      const file = safePath(directory, 'server.properties')
      const text = readFileSync(file, 'utf8')
      const line = `white-list=${this.policy.whitelistEnabled}`
      writeFileSync(file, /^white-list[=:]/mu.test(text) ? text.replace(/^white-list[=:].*$/mu, line) : text + '\n' + line + '\n', { mode: 0o600 })
    }
    saveJson(metadata, { banned: this.policy.banned.map((p) => p.uuid), whitelist: this.policy.whitelist.map((p) => p.uuid) })
  }
}
