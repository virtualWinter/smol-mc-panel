import assert from 'node:assert/strict'
import test from 'node:test'
import { connectionError, requireRscResponse } from '../src/framework/transport'

test('non-RSC and failed HTTP responses are rejected before React tries to decode them', async () => {
  await assert.rejects(requireRscResponse(new Response('Forbidden', { status: 403 })), /Access denied/u)
  await assert.rejects(requireRscResponse(new Response('Too large', { status: 413 })), /size limit/u)
  await assert.rejects(requireRscResponse(new Response('<html>Error</html>', { headers: { 'Content-Type': 'text/html' } })), /invalid panel response/u)
  const response = new Response('rsc', { headers: { 'Content-Type': 'text/x-component' } })
  assert.equal(await requireRscResponse(response), response)
})

test('interrupted RSC streams produce a readable recovery message rather than error 412', () => {
  for (const message of ['Connection closed.', 'Minified React error #412', 'Failed to fetch']) assert.match(connectionError(new Error(message)).message, /connection to the panel was interrupted/u)
})
