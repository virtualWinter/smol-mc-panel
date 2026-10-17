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

test('server operations require an authenticated request context', () => {
  assert.throws(() => requireAdmin(), /authenticated/u)
  const context = { root: '/unused', request: new Request('http://localhost/'), headers: new Headers() }
  requests.run(context, () => assert.throws(() => requireAdmin(), /Sign in/u))
  requests.run({ ...context, user: 'admin' }, () => assert.equal(requireAdmin(), 'admin'))
})
