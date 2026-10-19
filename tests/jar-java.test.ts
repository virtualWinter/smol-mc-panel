import assert from 'node:assert/strict'
import { crc32 } from 'node:zlib'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { requiredJava } from '../src/server/jar-java'
import { loadConfig, saveConfig } from '../src/server/config'
import { defaults } from './helpers'
import { NetworkRuntime } from '../src/server/runtime'

export function fixtureJar(path: string, major: number) {
  const bytes = Buffer.alloc(8)
  bytes.writeUInt32BE(0xcafebabe); bytes.writeUInt16BE(major, 6)
  const local: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const [name, body] of [['META-INF/MANIFEST.MF', Buffer.from('Manifest-Version: 1.0\r\nMain-Class: example.Main\r\nBuild-Jdk-Spec: 25\r\n\r\n')], ['example/Main.class', bytes], ['META-INF/versions/25/example/Main.class', Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 69])]] as const) {
    const filename = Buffer.from(name), header = Buffer.alloc(30), entry = Buffer.alloc(46)
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc32(body), 14); header.writeUInt32LE(body.length, 18); header.writeUInt32LE(body.length, 22); header.writeUInt16LE(filename.length, 26)
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(crc32(body), 16); entry.writeUInt32LE(body.length, 20); entry.writeUInt32LE(body.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42)
    local.push(header, filename, body); central.push(entry, filename); offset += header.length + filename.length + body.length
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(3, 8); end.writeUInt16LE(3, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  writeFileSync(path, Buffer.concat([...local, directory, end]))
}

test('JAR entry-point class versions distinguish Java 21 from Java 25', async () => {
  const root = mkdtempSync('/tmp/opencode/jar-java-version-')
  try {
    const path = resolve(root, 'server.jar')
    fixtureJar(path, 69)
    assert.equal(await requiredJava(path), 25)
    fixtureJar(path, 65)
    assert.equal(await requiredJava(path), 21, 'Build-Jdk and optional multi-release classes must not force an unnecessary upgrade')
    writeFileSync(path, 'not-a-jar')
    await assert.rejects(requiredJava(path), /valid executable JAR/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('runtime upgrades and persists Java 25 before launching a Java-25 JAR', async () => {
  const root = mkdtempSync('/tmp/opencode/runtime-jar-java-')
  saveConfig(root, defaults())
  const runtime = new NetworkRuntime(root, false, false, false)
  try {
    fixtureJar(resolve(root, 'servers/proxy/velocity.jar'), 69)
    mkdirSync(resolve(root, 'java/java-25/bin'), { recursive: true })
    const executable = resolve(root, 'java/java-25/bin/java')
    // Version-reporting fixture only: no JVM, downloads, or Minecraft launch.
    writeFileSync(executable, '#!/bin/sh\nprintf \'openjdk version "25.0.1"\\n\' >&2\n')
    chmodSync(executable, 0o755)
    await runtime.power('proxy', 'Start')
    assert.equal(loadConfig(root)[0].javaVersion, 'Java 25')
    assert.ok(runtime.manager.get('proxy').logs.some((line) => line.includes('switching from Java 21 to Java 25')))
  } finally { await runtime.shutdown(); rmSync(root, { recursive: true, force: true }) }
})
