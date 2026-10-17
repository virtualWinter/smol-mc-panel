import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { prepareStorage } from '../src/server/storage'

test('new storage uses data with servers and Java in separate subdirectories', () => {
  const cwd = mkdtempSync('/tmp/opencode/storage-new-')
  try {
    assert.equal(prepareStorage(cwd), resolve(cwd, 'data'))
    assert.ok(existsSync(resolve(cwd, 'data/java')))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('legacy network data and installed Java migrate without changing their contents', () => {
  const cwd = mkdtempSync('/tmp/opencode/storage-migrate-')
  try {
    mkdirSync(resolve(cwd, 'network/servers/proxy'), { recursive: true })
    mkdirSync(resolve(cwd, 'network/java-21/bin'), { recursive: true })
    writeFileSync(resolve(cwd, 'network/panel.json'), 'configuration')
    writeFileSync(resolve(cwd, 'network/servers/proxy/velocity.jar'), 'jar')
    writeFileSync(resolve(cwd, 'network/java-21/bin/java'), 'java')
    prepareStorage(cwd)
    assert.equal(existsSync(resolve(cwd, 'network')), false)
    assert.equal(readFileSync(resolve(cwd, 'data/panel.json'), 'utf8'), 'configuration')
    assert.equal(readFileSync(resolve(cwd, 'data/servers/proxy/velocity.jar'), 'utf8'), 'jar')
    assert.equal(readFileSync(resolve(cwd, 'data/java/java-21/bin/java'), 'utf8'), 'java')
    assert.equal(prepareStorage(cwd), resolve(cwd, 'data'))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('migration refuses a live panel or conflicting data directories', () => {
  const cwd = mkdtempSync('/tmp/opencode/storage-conflict-')
  try {
    mkdirSync(resolve(cwd, 'network'))
    writeFileSync(resolve(cwd, 'network/panel.json'), 'configuration')
    writeFileSync(resolve(cwd, 'network/.panel.lock'), JSON.stringify({ pid: process.pid }))
    assert.throws(() => prepareStorage(cwd), /Stop the panel/u)
    assert.ok(existsSync(resolve(cwd, 'network/panel.json')))
    mkdirSync(resolve(cwd, 'data'))
    assert.throws(() => prepareStorage(cwd), /Both network\/ and data\/ exist/u)
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})

test('custom data roots are supported and do not move unrelated network directories', () => {
  const cwd = mkdtempSync('/tmp/opencode/storage-custom-')
  try {
    mkdirSync(resolve(cwd, 'network'))
    writeFileSync(resolve(cwd, 'network/panel.json'), 'legacy')
    assert.equal(prepareStorage(cwd, 'custom'), resolve(cwd, 'custom'))
    assert.ok(existsSync(resolve(cwd, 'network/panel.json')))
  } finally { rmSync(cwd, { recursive: true, force: true }) }
})
