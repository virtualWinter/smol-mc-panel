import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { listDirectory, moveEntry, readText, uploadEntries, writeText } from '../src/server/files'

test('real files can be listed, edited, moved, and uploaded without overwriting', async () => {
  const root = mkdtempSync('/tmp/opencode/network-files-')
  try {
    mkdirSync(resolve(root, 'plugins'))
    writeFileSync(resolve(root, 'server.properties'), 'online-mode=false\n')
    assert.equal(listDirectory(root).length, 2)
    writeText(root, 'server.properties', 'max-players=20\n')
    assert.equal(readText(root, 'server.properties'), 'max-players=20\n')
    moveEntry(root, 'server.properties', 'plugins')
    assert.equal(existsSync(resolve(root, 'plugins/server.properties')), true)
    const data = new FormData()
    data.append('files', new File(['first'], 'server.properties'))
    await uploadEntries(root, 'plugins', data)
    assert.equal(readFileSync(resolve(root, 'plugins/server.properties (1)'), 'utf8'), 'first')
    assert.throws(() => moveEntry(root, 'plugins', 'plugins'))
    writeFileSync(resolve(root, 'server.jar'), Buffer.from([0, 1, 2]))
    assert.throws(() => readText(root, 'server.jar'))
    assert.throws(() => writeText(root, 'server.jar', 'overwrite binary'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
