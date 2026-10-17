import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeRequest } from '../src/server/access'

test('remote access requires credentials and configured passwords protect local access too', () => {
  const previous = process.env.PANEL_PASSWORD
  try {
    delete process.env.PANEL_PASSWORD
    assert.equal(authorizeRequest(new Request('http://localhost/')), undefined)
    assert.equal(authorizeRequest(new Request('http://public.example/'))?.status, 403)
    process.env.PANEL_PASSWORD = 'test-password'
    assert.equal(authorizeRequest(new Request('http://localhost/'))?.status, 401)
    const credentials = Buffer.from('admin:test-password').toString('base64')
    assert.equal(authorizeRequest(new Request('http://localhost/', { headers: { Authorization: `Basic ${credentials}` } })), undefined)
  } finally { if (previous === undefined) delete process.env.PANEL_PASSWORD; else process.env.PANEL_PASSWORD = previous }
})
