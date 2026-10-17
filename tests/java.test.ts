import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { c as archive } from 'tar'
import { installJava, javaMajor, managedJava } from '../src/server/java'
import type { DownloadProgressState } from '../src/types'

async function fixture(root: string, major = 21, unsafeLink = false) {
  mkdirSync(resolve(root, 'jdk-test/bin'), { recursive: true })
  const executable = resolve(root, 'jdk-test/bin/java')
  // A disposable version-reporting fixture, not a downloaded or real JVM.
  writeFileSync(executable, `#!/bin/sh\nprintf 'openjdk version "${major}.0.1"\\n' >&2\n`)
  chmodSync(executable, 0o755)
  if (unsafeLink) symlinkSync('/etc', resolve(root, 'jdk-test/outside'))
  await archive({ cwd: root, file: resolve(root, 'fixture.tar.gz'), gzip: true }, ['jdk-test'])
  return readFileSync(resolve(root, 'fixture.tar.gz'))
}

function requestFor(bytes: Buffer, corrupt = false): typeof fetch {
  return async (input) => {
    const url = String(input)
    if (url.startsWith('https://api.adoptium.net/')) return Response.json([{ version: { major: 21 }, binary: {
      architecture: process.arch === 'arm64' ? 'aarch64' : 'x64', os: 'linux', image_type: 'jdk',
      package: { checksum: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, link: 'https://github.com/adoptium/temurin21-binaries/releases/download/test/java.tar.gz' },
    } }])
    assert.ok(url.startsWith('https://github.com/adoptium/temurin21-binaries/'))
    const data = Uint8Array.from(bytes)
    if (corrupt) data[0] ^= 1
    return new Response(data, { headers: { 'Content-Length': String(data.length) } })
  }
}

test('missing Java installs into network/java-21, reports progress, and reuses the verified installation', async () => {
  const root = mkdtempSync('/tmp/opencode/java-install-')
  try {
    const bytes = await fixture(root)
    const progress: DownloadProgressState[] = []
    const network = resolve(root, 'network')
    const executable = await installJava({ root: network, major: 21, request: requestFor(bytes), onProgress: (value) => progress.push(value) })
    assert.equal(executable, resolve(network, 'java-21/bin/java'))
    assert.equal(javaMajor(executable), 21)
    assert.ok(progress.some((value) => value.phase === 'extracting' && value.label === 'Java 21'))
    assert.equal(progress.at(-1)!.phase, 'complete')
    assert.deepEqual(readdirSync(network), ['java-21'])
    assert.equal(await installJava({ root: network, major: 21, request: async () => { throw new Error('Must not redownload') } }), executable)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Java checksum failures remove partial archives and never create the final installation', async () => {
  const root = mkdtempSync('/tmp/opencode/java-checksum-')
  try {
    const network = resolve(root, 'network')
    await assert.rejects(installJava({ root: network, major: 21, request: requestFor(await fixture(root), true) }), /verification failed/u)
    assert.equal(existsSync(resolve(network, 'java-21')), false)
    assert.deepEqual(readdirSync(network), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Java extraction refuses links outside the installation directory', async () => {
  const root = mkdtempSync('/tmp/opencode/java-links-')
  try {
    const network = resolve(root, 'network')
    await assert.rejects(installJava({ root: network, major: 21, request: requestFor(await fixture(root, 21, true)) }), /unsafe paths or links/u)
    assert.deepEqual(readdirSync(network), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('Java executable verification rejects the wrong major version', async () => {
  const root = mkdtempSync('/tmp/opencode/java-version-')
  try {
    const network = resolve(root, 'network')
    await assert.rejects(installJava({ root: network, major: 21, request: requestFor(await fixture(root, 17)) }), /wrong version/u)
    assert.deepEqual(readdirSync(network), [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('system Java and JAVA_21_BIN never replace a panel-managed Java installation', () => {
  const root = mkdtempSync('/tmp/opencode/java-override-')
  const previous = process.env.JAVA_21_BIN
  try {
    process.env.JAVA_21_BIN = process.execPath
    assert.equal(managedJava(root, 21), undefined)
  } finally {
    if (previous === undefined) delete process.env.JAVA_21_BIN; else process.env.JAVA_21_BIN = previous
    rmSync(root, { recursive: true, force: true })
  }
})
