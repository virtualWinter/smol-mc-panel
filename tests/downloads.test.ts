import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { reinstallJar } from '../src/server/downloads'
import type { DownloadProgressState } from '../src/types'

const body = Buffer.from('PK\x03\x04verified-jar')
const downloadUrl = 'https://fill-data.papermc.io/v1/objects/test/server.jar'
const userAgent = 'panel-test/1.0 (mailto:test@example.com)'

function mockRequest(calls: string[], corrupt = false): typeof fetch {
  return async (input, options) => {
    const url = String(input)
    calls.push(url)
    assert.equal(new Headers(options?.headers).get('User-Agent'), userAgent)
    assert.equal(options?.redirect, 'error')
    if (url.endsWith('/projects/paper')) return Response.json({ versions: { '1.21': ['1.21.11'] } })
    if (url.endsWith('/builds')) return Response.json([
      { id: 99, channel: 'EXPERIMENTAL', downloads: {} },
      { id: 42, channel: 'STABLE', downloads: { 'server:default': { url: downloadUrl, size: body.length, checksums: { sha256: createHash('sha256').update(body).digest('hex') } } } },
    ])
    assert.equal(url, downloadUrl)
    const bytes = Uint8Array.from(body)
    if (corrupt) bytes[bytes.length - 1] ^= 1
    return new Response(new ReadableStream({ start(controller) { const middle = Math.floor(bytes.length / 2); controller.enqueue(bytes.slice(0, middle)); controller.enqueue(bytes.slice(middle)); controller.close() } }), { headers: { 'Content-Length': String(bytes.length) } })
  }
}

test('reinstall downloads a stable build, verifies it, and pins future reinstalls to the same build', async () => {
  const root = mkdtempSync('/tmp/opencode/jar-install-')
  try {
    writeFileSync(resolve(root, 'server.jar'), 'old-jar')
    writeFileSync(resolve(root, 'world.txt'), 'do-not-touch')
    const calls: string[] = []
    const progress: DownloadProgressState[] = []
    const options = { directory: root, jarFile: 'server.jar', project: 'paper' as const, manifest: resolve(root, 'installations/paper.json'), userAgent, request: mockRequest(calls), onProgress: (value: DownloadProgressState) => progress.push(value) }
    const source = await reinstallJar(options)
    assert.equal(source.build, 42)
    assert.deepEqual(readFileSync(resolve(root, 'server.jar')), body)
    assert.equal(readFileSync(resolve(root, 'world.txt'), 'utf8'), 'do-not-touch')
    assert.equal(progress[0].phase, 'resolving')
    assert.ok(progress.some((value) => value.phase === 'downloading' && value.received > 0 && value.received < value.total && value.bytesPerSecond > 0))
    assert.ok(progress.some((value) => value.phase === 'verifying'))
    assert.ok(progress.some((value) => value.phase === 'installing'))
    assert.equal(progress.at(-1)!.phase, 'complete')
    assert.equal(progress.at(-1)!.received, body.length)
    calls.length = 0
    await reinstallJar(options)
    assert.deepEqual(calls, [downloadUrl])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('failed JAR verification preserves the existing JAR and removes partial downloads', async () => {
  const root = mkdtempSync('/tmp/opencode/jar-failure-')
  try {
    writeFileSync(resolve(root, 'server.jar'), 'old-jar')
    const manifest = resolve(root, 'installations/paper.json')
    await assert.rejects(reinstallJar({ directory: root, jarFile: 'server.jar', project: 'paper', manifest, userAgent, request: mockRequest([], true) }), /verification failed/u)
    assert.equal(readFileSync(resolve(root, 'server.jar'), 'utf8'), 'old-jar')
    assert.equal(existsSync(manifest), false)
    assert.deepEqual(readdirSync(root), ['server.jar'])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('PaperMC downloads require an identifying contact User-Agent', async () => {
  const root = mkdtempSync('/tmp/opencode/jar-user-agent-')
  try {
    await assert.rejects(reinstallJar({ directory: root, jarFile: 'server.jar', project: 'paper', manifest: resolve(root, 'install.json'), userAgent: 'generic-agent' }), /PAPERMC_USER_AGENT/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
