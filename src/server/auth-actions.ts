'use server'

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAccount, readAccount, validateCredentials, verifyPassword } from './accounts'
import { loadConfig, proxyConfig, saveConfig } from './config'
import { acquireLock } from './lock'
import { PanelError } from './errors'
import { requestContext, setSession } from './request-context'

const failures: number[] = []

export async function setupPanel(username: string, password: string, kind: 'velocity' | 'bungeecord') {
  const context = requestContext()
  if (readAccount(context.root)) throw new PanelError('Setup is already complete. Sign in instead.')
  validateCredentials(username, password)
  if (!['velocity', 'bungeecord'].includes(kind)) throw new PanelError('Choose Velocity or BungeeCord.')
  const release = acquireLock(context.root)
  try {
    if (existsSync(resolve(context.root, 'panel.json'))) {
      const servers = loadConfig(context.root)
      if (servers.find((server) => server.kind !== 'paper')?.kind !== kind) throw new PanelError('The existing network uses a different proxy type. Existing server data will not be overwritten.')
    } else {
      // This is the only initial server creation path: explicit admin setup.
      saveConfig(context.root, [proxyConfig(kind)])
    }
    const account = createAccount(context.root, username, password)
    setSession(account)
  } finally { release() }
}

export async function login(username: string, password: string) {
  const context = requestContext()
  const account = readAccount(context.root)
  if (!account) throw new PanelError('Complete setup first.')
  while (failures.length && Date.now() - failures[0] > 60_000) failures.shift()
  if (failures.length >= 5) throw new PanelError('Too many sign-in attempts. Try again in one minute.')
  if (!verifyPassword(account, username, password)) { failures.push(Date.now()); throw new PanelError('Incorrect username or password.') }
  failures.length = 0
  setSession(account)
}

export async function logout() { setSession() }
