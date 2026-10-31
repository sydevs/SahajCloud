/**
 * Unit tests for the shared delivery-log helpers (`src/fields/logField.ts`).
 * Pure — no Payload, no DB.
 *
 * Replaces `reminder-ledger.spec.ts`: the session-reminder ledger had its own
 * coercion and membership check, which these now serve for every log.
 */
import { describe, expect, it } from 'vitest'

import { appendLogEntry, asLog, DEFAULT_LOG_LIMIT, hasLogEntry, type LogEntry } from '@/fields'
import { logEntryAddresses, restoreLogAddresses, withoutLogAddresses } from '@/fields/logField'

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

  it('keeps well-formed entries and drops malformed ones', () => {
    const good = entry()
    expect(asLog([good, { cells: { activity: 'no at/type' } }, 42, null])).toEqual([good])
  })

  it('preserves extra properties a consumer carries', () => {
    // The verification log adds level/role/region and renders them itself. The
    // coercion must not strip what it does not recognise.
    const rich = entry({ level: 'urgent', role: 'region' })
    expect(asLog([rich])[0]).toMatchObject({ level: 'urgent', role: 'region' })
  })
})

describe('appendLogEntry', () => {
  it('appends in chronological order', () => {
    const first = entry({ at: '2026-07-01T00:00:00.000Z' })
    const second = entry({ at: '2026-07-02T00:00:00.000Z' })
    expect(appendLogEntry([first], second)).toEqual([first, second])
  })

  it('drops the oldest once the limit is reached', () => {
    // The reason this helper exists: a weekly class gains an entry per
    // occurrence, and nothing was bounding the column it lives in.
    const log = Array.from({ length: 3 }, (_, i) =>
      entry({ at: `2026-07-0${i + 1}T00:00:00.000Z`, key: String(i) }),
    )
    const capped = appendLogEntry(log, entry({ key: 'newest' }), 3)
    expect(capped).toHaveLength(3)
    expect(capped.map((e) => e.key)).toEqual(['1', '2', 'newest'])
  })

  it('leaves a log under the limit untouched', () => {
    const log = [entry({ key: 'a' })]
    expect(appendLogEntry(log, entry({ key: 'b' }), 10)).toHaveLength(2)
  })

  it('defaults to the shared limit', () => {
    const full = Array.from({ length: DEFAULT_LOG_LIMIT }, (_, i) => entry({ key: String(i) }))
    expect(appendLogEntry(full, entry({ key: 'new' }))).toHaveLength(DEFAULT_LOG_LIMIT)
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

// #1047 — the address keys a log opts into narrowing.
describe('log addresses', () => {
  const KEYS = { types: ['reminder'], keys: ['destination', 'cells.delivery'] }
  const reminder = {
    at: '2026-10-30T09:00:00.000Z',
    type: 'reminder',
    manager: { id: 7, name: 'Region Manager' },
    channel: 'whatsapp',
    destination: '+44 7700 900123',
    cells: {
      activity: 'Escalation',
      who: { text: 'Region Manager', sub: 'Region manager' },
      delivery: { label: 'whatsapp', text: '+44 7700 900123' },
    },
  }

  it('reads an address from a machine key and from a cell object or string', () => {
    expect(logEntryAddresses(reminder, KEYS)).toEqual(['+44 7700 900123', '+44 7700 900123'])
    expect(
      logEntryAddresses(
        { type: 'delivery', cells: { sentTo: 'a@b.test' } },
        { types: ['delivery'], keys: ['cells.sentTo'] },
      ),
    ).toEqual(['a@b.test'])
    expect(logEntryAddresses(null, KEYS)).toEqual([])
  })

  it('reads none from an entry of a type that records no address', () => {
    // A verification's Delivery cell is the method — 'Saved', 'Email link' —
    // under the same key a reminder's address sits in.
    const verification = { ...reminder, type: 'verification', cells: { delivery: 'Email link' } }
    expect(logEntryAddresses(verification, KEYS)).toEqual([])
    expect(withoutLogAddresses(verification, KEYS)).toBe(verification)
  })

  it('removes every address key and leaves the rest of the entry, and the input, alone', () => {
    const redacted = withoutLogAddresses(reminder, KEYS) as typeof reminder
    expect(redacted).not.toHaveProperty('destination')
    expect(redacted.cells).not.toHaveProperty('delivery')
    expect(redacted).toMatchObject({
      channel: 'whatsapp',
      manager: { id: 7 },
      cells: { activity: 'Escalation', who: { text: 'Region Manager' } },
    })
    expect(reminder.destination).toBe('+44 7700 900123')
    expect(reminder.cells.delivery.text).toBe('+44 7700 900123')
  })

  it('restores a stored entry from its exact redacted copy, whatever the key order', () => {
    const { cells, ...rest } = withoutLogAddresses(reminder, KEYS) as typeof reminder
    const reordered = { cells: { who: cells.who, activity: cells.activity }, ...rest }
    const appended = {
      at: '2026-10-30T10:00:00.000Z',
      type: 'review',
      cells: { activity: 'Rejected' },
    }

    expect(restoreLogAddresses([reordered, appended], [reminder], KEYS)).toEqual([
      reminder,
      appended,
    ])
  })

  it('restores nothing to an entry that differs from the stored one in any other way', () => {
    // A writer can get back only what was already stored for that exact entry.
    const altered = { ...(withoutLogAddresses(reminder, KEYS) as object), channel: 'email' }
    expect(restoreLogAddresses([altered], [reminder], KEYS)).toEqual([altered])
  })

  it('leaves a write with nothing stored, or nothing redactable, untouched', () => {
    const incoming = [withoutLogAddresses(reminder, KEYS)]
    expect(restoreLogAddresses(incoming, undefined, KEYS)).toBe(incoming)
    expect(
      restoreLogAddresses(incoming, [{ type: 'verification', cells: { delivery: 'Saved' } }], KEYS),
    ).toBe(incoming)
  })
})
