import assert from 'node:assert/strict'
import test from 'node:test'
import { displayDate } from '../src/components/ui-format'

test('UI timestamps are readable, deterministic UTC dates', () => {
  const value = displayDate('2026-10-18T12:45:00.000Z')
  assert.ok(value.includes('18 Oct 2026'))
  assert.ok(value.includes('12:45'))
  assert.ok(value.endsWith('UTC'))
  assert.equal(displayDate('not a date'), '—')
  assert.equal(displayDate(), '—')
})
