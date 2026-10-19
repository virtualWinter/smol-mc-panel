import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { createAccount, issueSession, readAccount, sessionFromRequest, verifyPassword, verifySession } from '../src/server/accounts'
import { login, logout, setupPanel } from '../src/server/auth-actions'
import { loadConfig, saveConfig } from '../src/server/config'
import { requests } from '../src/server/request-context'
import { defaults } from './helpers'
import type { SetupServerInput } from '../src/types'
import { velocityStartupIssue } from '../src/server/proxy-config'

const password = 'correct-password-123'
const lobby: SetupServerInput = { id: 'lobby', name: 'Lobby', port: 25566, maxMemory: 2048, javaVersion: 'Java 25' }
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

test('first-start velocity setup creates the explicitly selected proxy and backend with an admin session', async () => {
  const root = mkdtempSync('/tmp/opencode/setup-')
  try {
    const request = context(root)
    await requests.run(request, () => setupPanel('owner', password, [lobby]))
    const servers = loadConfig(root)
    assert.equal(servers.length, 2)
    assert.equal(servers[0].kind, 'velocity')
    assert.equal(servers[1].id, 'lobby')
    assert.equal(servers[1].javaVersion, 'Java 25')
    const lobbyDirectory = resolve(root, servers[1].workingDirectory)
    const proxyDirectory = resolve(root, servers[0].workingDirectory)
    assert.ok(existsSync(resolve(lobbyDirectory, 'server.properties')))
    assert.equal(readFileSync(resolve(lobbyDirectory, 'eula.txt'), 'utf8').includes('eula=false'), true)
    assert.equal(existsSync(resolve(lobbyDirectory, 'server.jar')), false)
    const config = readFileSync(resolve(proxyDirectory, 'velocity.toml'), 'utf8')
    assert.ok(config.includes('lobby = "127.0.0.1:25566"'))
    assert.ok(config.includes('try = ["lobby"]'))
    assert.equal(velocityStartupIssue(proxyDirectory), undefined)
    assert.ok(readAccount(root))
    assert.equal(request.user, 'owner')
    assert.ok(request.headers.get('Set-Cookie')?.includes('HttpOnly; SameSite=Strict'))
    await assert.rejects(requests.run(context(root), () => setupPanel('other', password)), /already complete/u)
    const signedOut = context(root)
    await assert.rejects(requests.run(signedOut, () => login('owner', 'wrong-password')), /Incorrect/u)
    await requests.run(signedOut, () => login('owner', password))
    assert.equal(signedOut.user, 'owner')
    await requests.run(signedOut, () => logout())
    assert.equal(signedOut.user, undefined)
    assert.ok(signedOut.headers.get('Set-Cookie')?.includes('Max-Age=0'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('setup rejects empty server lists, duplicate IDs/ports, and unsafe server paths before writing any configuration', async () => {
  for (const servers of [[], [lobby, { ...lobby }], [{ ...lobby, id: 'proxy' }], [{ ...lobby, port: 25565 }], [{ ...lobby, id: '../outside' }], [{ ...lobby, maxMemory: 128 }]]) {
    const root = mkdtempSync('/tmp/opencode/setup-backends-invalid-')
    try {
      await assert.rejects(requests.run(context(root), () => setupPanel('owner', password, servers)))
      assert.equal(existsSync(resolve(root, 'panel.json')), false)
      assert.equal(existsSync(resolve(root, 'admin.json')), false)
      assert.equal(existsSync(resolve(root, 'servers')), false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})

test('setup creates multiple selected servers and wires all of them into the proxy', async () => {
  const root = mkdtempSync('/tmp/opencode/setup-multiple-backends-')
  try {
    await requests.run(context(root), () => setupPanel('owner', password, [lobby, { ...lobby, id: 'survival', name: 'Survival', port: 25567, maxMemory: 4096 }]))
    const servers = loadConfig(root)
    assert.deepEqual(servers.map((server) => server.id), ['proxy', 'lobby', 'survival'])
    assert.equal(servers[2].maxMemory, 4096)
    const proxyDirectory = resolve(root, servers[0].workingDirectory)
    assert.equal(velocityStartupIssue(proxyDirectory), undefined)
    const config = readFileSync(resolve(proxyDirectory, 'velocity.toml'), 'utf8')
    assert.ok(config.includes('127.0.0.1:25566') && config.includes('127.0.0.1:25567'))
    assert.ok(config.includes('try = ["lobby"]'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('invalid setup never creates a server configuration or admin account', async () => {
  const root = mkdtempSync('/tmp/opencode/setup-invalid-')
  try {
    await assert.rejects(requests.run(context(root), () => setupPanel('owner', 'short')), /password/u)
    assert.equal(existsSync(resolve(root, 'panel.json')), false)
    assert.equal(existsSync(resolve(root, 'admin.json')), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('account-only setup preserves existing networks and their servers', async () => {
  const root = mkdtempSync('/tmp/opencode/setup-existing-')
  try {
    saveConfig(root, defaults())
    await assert.rejects(requests.run(context(root), () => setupPanel('owner', password, [lobby])), /not part of account-only/u)
    assert.equal(readAccount(root), undefined)
    await requests.run(context(root), () => setupPanel('owner', password))
    assert.equal(loadConfig(root).length, 3)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
