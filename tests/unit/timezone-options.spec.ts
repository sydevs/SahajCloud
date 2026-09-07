import { createHash } from 'node:crypto'

import { rawTimeZones } from '@vvo/tzdb'
import { defaultTimezones } from 'payload/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SUPPORTED_TIMEZONES } from '@/lib/timezones'

/**
 * The pinned member list, as a digest of the values in order.
 *
 * Every `timezone: true` field bakes a Postgres enum from this list, so both the
 * membership and the ORDER are schema. Before #722 the order came straight from
 * `getTimeZones()`, which sorts by current UTC offset — so it moved at every DST
 * boundary and a clean checkout generated a 111 KB no-op migration. That call
 * also drops any zone the host's ICU cannot format, so it decided membership
 * too. The module reads the static `rawTimeZones` now, and these cases pin both.
 *
 * When this goes red, the list changed. Regenerate it deliberately and ship the
 * migration in the same PR. Never update the digest to match a diff you have not
 * read: `pnpm db:migrations:create` will drop and recreate five enum types.
 */
const PINNED_LENGTH = 581
const PINNED_DIGEST = 'd5f89148e2258cfad4284c3dfc0ea559b0a589ff0cd3f23cccd76c313942face'

const digestOf = (values: string[]) => createHash('sha256').update(values.join('\n')).digest('hex')

describe('SUPPORTED_TIMEZONES', () => {
  const options = SUPPORTED_TIMEZONES

  afterEach(() => {
    vi.doUnmock('@vvo/tzdb')
    vi.resetModules()
  })

  it('pins the exact member list, because the order is baked into five Postgres enums', () => {
    const values = options.map((o) => o.value)
    expect(values.length).toBe(PINNED_LENGTH)
    expect(digestOf(values)).toBe(PINNED_DIGEST)
  })

  it('orders zones by raw offset, so the list never moves with a DST boundary', () => {
    // Only the tzdb loop is sorted. `UTC` and Payload's curated `defaultTimezones`
    // are seeded ahead of it on purpose, to keep their friendlier labels, so they
    // are excluded here rather than asserted out of order.
    const seededFirst = new Set(['UTC', ...defaultTimezones.map((t) => t.value)])
    // `rawOffsetInMinutes` is fixed for a zone. `currentTimeOffsetInMinutes` is not.
    const rank = new Map(rawTimeZones.map((z) => [z.name, z.rawOffsetInMinutes]))
    const offsets = options
      .filter((o) => !seededFirst.has(o.value))
      .map((o) => rank.get(o.value))
      .filter((n): n is number => n !== undefined)

    expect(offsets.length).toBeGreaterThan(250)
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1])
    }
  })

  it('ignores the order the tzdb export happens to arrive in', async () => {
    // The real defect: the list inherited its input's order. Feeding the same
    // zones back reversed must change nothing at all.
    vi.doMock('@vvo/tzdb', () => ({ rawTimeZones: [...rawTimeZones].reverse() }))
    vi.resetModules()

    const { SUPPORTED_TIMEZONES: reordered } = await import('@/lib/timezones')

    // Deliberately NOT compared against the pinned digest — that is the case
    // above. This one fails only when the input's order leaks into the output.
    expect(reordered.map((o) => o.value)).toEqual(options.map((o) => o.value))
  })

  it('actually reads the mocked export, so the case above cannot pass vacuously', async () => {
    // Without this, a mock that silently stopped applying would leave the
    // reversal case asserting the real module against itself, forever green.
    vi.doMock('@vvo/tzdb', () => ({ rawTimeZones: rawTimeZones.slice(0, 2) }))
    vi.resetModules()

    const { SUPPORTED_TIMEZONES: truncated } = await import('@/lib/timezones')

    expect(truncated.length).toBeLessThan(PINNED_LENGTH)
  })

  it('never calls getTimeZones(), which drops zones the host ICU cannot format', async () => {
    // `getTimeZones()` resolves each zone through Intl and silently skips the
    // ones that throw, so an older runtime would build a shorter enum. Reaching
    // for it here must be impossible, not merely avoided today.
    vi.doMock('@vvo/tzdb', () => ({
      rawTimeZones,
      getTimeZones: () => {
        throw new Error('getTimeZones() is host-dependent — read rawTimeZones instead')
      },
    }))
    vi.resetModules()

    const { SUPPORTED_TIMEZONES: viaRaw } = await import('@/lib/timezones')

    expect(digestOf(viaRaw.map((o) => o.value))).toBe(PINNED_DIGEST)
  })

  it('returns the bundled IANA zone set', () => {
    expect(options.length).toBeGreaterThan(40)
  })

  it('gives every option a non-empty IANA value and label', () => {
    for (const option of options) {
      expect(option.value.length).toBeGreaterThan(0)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('includes well-known IANA zone values', () => {
    const values = options.map((o) => o.value)
    expect(values).toContain('Europe/London')
    expect(values).toContain('America/New_York')
    expect(values).toContain('Asia/Tokyo')
  })

  it('has unique values', () => {
    const values = options.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
