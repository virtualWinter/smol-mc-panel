import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { createAccount, issueSession, readAccount, sessionFromRequest, verifyPassword, verifySession } from '../src/server/accounts'
import { login, logout, setupPanel } from '../src/server/auth-actions'
import { loadConfig, saveConfig } from '../src/server/config'
import { requests } from '../src/server/request-context'
import { defaults } from './helpers'

const password = 'correct-password-123'
const context = (root: string) => ({ root, request: new Request('http://localhost/'), headers: new Headers(), user: undefined as string | undefined })

test('passwords are salted hashes and signed sessions reject tampering and expiration', () => {
  const root = mkdtempSync('/tmp/opencode/account-')
  try {
    const account = createAccount(root, 'owner', password)
    assert.equal(readFileSync(resolve(root, 'admin.json'), 'utf8').includes(password), false)
    assert.equal(statSync(resolve(root, 'admin.json')).mode & 0o777, 0o600)
    assert.ok(verifyPassword(account, 'owner', password))
    assert.equal(verifyPassword(account, 'owner', 'wrong-password'), false)
    assert.equal(verifyPassword(account, 'other', password), false)
    const token = issueSession(account)
    assert.ok(verifySession(account, token))
    assert.equal(verifySession(account, `${token}changed`), false)
    assert.equal(verifySession(account, issueSession(account, Date.now() - 8 * 24 * 3600 * 1000)), false)
    assert.equal(sessionFromRequest(account, new Request('http://localhost/', { headers: { Cookie: `smol_panel_session=${token}` } })), 'owner')
    assert.throws(() => createAccount(root, 'another', password), /already exists/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

for (const kind of ['velocity', 'bungeecord'] as const) test(`first-start ${kind} setup creates one proxy, an admin, and an HttpOnly session`, async () => {
  const root = mkdtempSync('/tmp/opencode/setup-')
  try {
    const request = context(root)
    await requests.run(request, () => setupPanel('owner', password, kind))
    const servers = loadConfig(root)
    assert.equal(servers.length, 1)
    assert.equal(servers[0].kind, kind)
    assert.ok(readAccount(root))
    assert.equal(request.user, 'owner')
    assert.ok(request.headers.get('Set-Cookie')?.includes('HttpOnly; SameSite=Strict'))
    await assert.rejects(requests.run(context(root), () => setupPanel('other', password, kind)), /already complete/u)
    const signedOut = context(root)
    await assert.rejects(requests.run(signedOut, () => login('owner', 'wrong-password')), /Incorrect/u)
    await requests.run(signedOut, () => login('owner', password))
    assert.equal(signedOut.user, 'owner')
    await requests.run(signedOut, () => logout())
    assert.equal(signedOut.user, undefined)
    assert.ok(signedOut.headers.get('Set-Cookie')?.includes('Max-Age=0'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('invalid setup never creates a server configuration or admin account', async () => {
  const root = mkdtempSync('/tmp/opencode/setup-invalid-')
  try {
    await assert.rejects(requests.run(context(root), () => setupPanel('owner', 'short', 'velocity')), /password/u)
    assert.equal(existsSync(resolve(root, 'panel.json')), false)
    assert.equal(existsSync(resolve(root, 'admin.json')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('setup preserves existing networks and refuses to silently switch their proxy software', async () => {
  const root = mkdtempSync('/tmp/opencode/setup-existing-')
  try {
    saveConfig(root, defaults())
    await assert.rejects(requests.run(context(root), () => setupPanel('owner', password, 'bungeecord')), /different proxy/u)
    assert.equal(readAccount(root), undefined)
    await requests.run(context(root), () => setupPanel('owner', password, 'velocity'))
    assert.equal(loadConfig(root).length, 3)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
