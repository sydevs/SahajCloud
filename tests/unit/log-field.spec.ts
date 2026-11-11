/**
 * Unit tests for the shared delivery-log helpers (`src/fields/logField.ts`).
 * Pure — no Payload, no DB.
 *
 * Replaces `reminder-ledger.spec.ts`: the session-reminder ledger had its own
 * coercion and membership check, which these now serve for every log.
 */
import { describe, expect, it } from 'vitest'

import { asLog, hasLogEntry, type LogEntry, toLogRow } from '@/fields'

const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  at: '2026-07-20T10:00:00.000Z',
  type: 'session-reminder',
  cells: { activity: 'Session reminder' },
  ...overrides,
})

describe('asLog', () => {
  it('returns [] for non-array / nullish values', () => {
    expect(asLog(null)).toEqual([])
    expect(asLog(undefined)).toEqual([])
    expect(asLog('nope')).toEqual([])
    expect(asLog({})).toEqual([])
  })

  it('keeps well-formed rows and drops malformed ones', () => {
    const good = entry()
    expect(asLog([toLogRow(good), { cells: { activity: 'no at/type' } }, 42, null])).toEqual([good])
  })

  it('spreads a stored row machine data back onto the entry', () => {
    // The verification log adds level/role/region and renders them itself. A
    // reader sees one flat entry, whichever column each key is stored in.
    const rich = entry({ level: 'urgent', role: 'region' })
    expect(asLog([toLogRow(rich)])[0]).toMatchObject({ level: 'urgent', role: 'region' })
  })

  it('round-trips an entry through the row that stores it', () => {
    const rich = entry({ key: '42', level: 'urgent', manager: { id: 7 } })
    expect(asLog([toLogRow(rich)])).toEqual([rich])
  })
})

describe('hasLogEntry', () => {
  const log = [
    entry({ type: 'session-reminder', key: '2026-07-21T10:00:00.000Z' }),
    entry({ type: 'post-event-follow-up', key: '42' }),
  ]

  it('is true only for a logged event + key pair', () => {
    expect(hasLogEntry(log, 'session-reminder', '2026-07-21T10:00:00.000Z')).toBe(true)
    expect(hasLogEntry(log, 'session-reminder', '2026-07-22T10:00:00.000Z')).toBe(false)
    expect(hasLogEntry([], 'session-reminder', '2026-07-21T10:00:00.000Z')).toBe(false)
  })

  it('does not match a key logged under a different event', () => {
    // One log now holds several kinds of message, so a bare key would collide:
    // registration 42's follow-up must not read as its reminder.
    expect(hasLogEntry(log, 'session-reminder', '42')).toBe(false)
    expect(hasLogEntry(log, 'post-event-follow-up', '42')).toBe(true)
  })
})
