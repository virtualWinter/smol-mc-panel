import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { resolve } from 'node:path'
import { PanelError } from './errors'
import { readJson, saveJson } from './json-store'

export interface AdminAccount {
  version: 1
  username: string
  salt: string
  passwordHash: string
  sessionSecret: string
}

export function readAccount(root: string): AdminAccount | undefined {
  const account = readJson<AdminAccount | undefined>(resolve(root, 'admin.json'), undefined)
  if (!account) return
  if (account.version !== 1 || typeof account.username !== 'string' || !/^[a-f0-9]{32}$/u.test(account.salt) || !/^[a-f0-9]{128}$/u.test(account.passwordHash) || !/^[a-f0-9]{64}$/u.test(account.sessionSecret)) throw new PanelError('Invalid admin account. Restore it from a trusted backup.')
  return account
}

export function validateCredentials(username: string, password: string) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9._-]{1,32}$/u.test(username)) throw new PanelError('Use 1–32 letters, numbers, dots, dashes, or underscores for the admin username.')
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new PanelError('Use an admin password between 12 and 128 characters.')
}

export function createAccount(root: string, username: string, password: string): AdminAccount {
  validateCredentials(username, password)
  if (readAccount(root)) throw new PanelError('An admin account already exists. Sign in instead.')
  const salt = randomBytes(16).toString('hex')
  const account: AdminAccount = { version: 1, username, salt, passwordHash: scryptSync(password, salt, 64).toString('hex'), sessionSecret: randomBytes(32).toString('hex') }
  saveJson(resolve(root, 'admin.json'), account)
  return account
}

export function verifyPassword(account: AdminAccount, username: string, password: string): boolean {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128) return false
  const actual = scryptSync(password, account.salt, 64)
  return timingSafeEqual(actual, Buffer.from(account.passwordHash, 'hex')) && username === account.username
}

export const sessionLifetime = 7 * 24 * 60 * 60
export const sessionCookie = 'smol_panel_session'

export function issueSession(account: AdminAccount, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ username: account.username, expires: now + sessionLifetime * 1000, nonce: randomBytes(16).toString('hex') })).toString('base64url')
  return `${payload}.${createHmac('sha256', account.sessionSecret).update(payload).digest('hex')}`
}

export function verifySession(account: AdminAccount, token: string, now = Date.now()): boolean {
  if (!token || token.length > 1024) return false
  const [payload, signature, extra] = token.split('.')
  if (extra !== undefined || !payload || !/^[a-f0-9]{64}$/u.test(signature ?? '')) return false
  const expected = createHmac('sha256', account.sessionSecret).update(payload).digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { username: string; expires: number }
    return data.username === account.username && Number.isFinite(data.expires) && data.expires > now && data.expires <= now + sessionLifetime * 1000
  } catch { return false }
}

export function sessionFromRequest(account: AdminAccount | undefined, request: Request) {
  if (!account) return
  const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1)
  return token && verifySession(account, token) ? account.username : undefined
}
