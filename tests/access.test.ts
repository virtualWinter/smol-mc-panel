import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeRequest } from '../src/server/access'
import { requests, requireAdmin } from '../src/server/request-context'

test('first-start setup is local-only; configured installations use the login layer', () => {
  assert.equal(authorizeRequest(new Request('http://localhost/'), false), undefined)
  assert.equal(authorizeRequest(new Request('http://public.example/'), false)?.status, 403)
  assert.equal(authorizeRequest(new Request('http://localhost/', { headers: { 'x-forwarded-for': '1.2.3.4' } }), false)?.status, 403)
  assert.equal(authorizeRequest(new Request('https://panel.example/'), true), undefined)
})

test('pre-setup allows a deliberately declared HTTPS origin behind a trusted proxy', () => {
  const previous = process.env.PANEL_ORIGIN
  process.env.PANEL_ORIGIN = 'https://panel.arsn.cc'
  try {
    // Standard HTTPS reverse proxy: end-to-end TLS at the last hop.
    const proxied = { headers: { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https' } }
    assert.equal(authorizeRequest(new Request('https://panel.arsn.cc/', proxied), false), undefined)
    // Cloudflare-proxied origins may still speak plain HTTP behind the proxy.
    const flexible = { headers: { 'x-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '203.0.113.99', 'cdn-loop': 'cloudflare' } }
    assert.equal(authorizeRequest(new Request('http://panel.arsn.cc/', flexible), false), undefined)
    // Everything else stays rejected: wrong origin, plain HTTP, and direct requests.
    assert.equal(authorizeRequest(new Request('https://intruder.example/', proxied), false)?.status, 403)
    assert.equal(authorizeRequest(new Request('http://panel.arsn.cc/', proxied), false)?.status, 403)
    assert.equal(authorizeRequest(new Request('http://panel.arsn.cc/', { headers: { 'cdn-loop': 'cloudflare' } }), false), undefined)
    assert.equal(authorizeRequest(new Request('http://panel.arsn.cc/'), false)?.status, 403)
    assert.equal(authorizeRequest(new Request('https://panel.arsn.cc/'), false)?.status, 403)
    assert.equal(authorizeRequest(new Request('http://localhost/'), false), undefined)
    // An invalid declaration never widens the loopback-only default.
    process.env.PANEL_ORIGIN = 'not a url'
    assert.equal(authorizeRequest(new Request('https://whatever.example/', proxied), false)?.status, 403)
  } finally {
    if (previous === undefined) delete process.env.PANEL_ORIGIN
    else process.env.PANEL_ORIGIN = previous
  }
})

test('server operations require an authenticated request context', () => {
  assert.throws(() => requireAdmin(), /authenticated/u)
  const context = { root: '/unused', request: new Request('http://localhost/'), headers: new Headers() }
  requests.run(context, () => assert.throws(() => requireAdmin(), /Sign in/u))
  requests.run({ ...context, user: 'admin' }, () => assert.equal(requireAdmin(), 'admin'))
})
