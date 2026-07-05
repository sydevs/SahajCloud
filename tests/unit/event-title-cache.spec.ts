import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_EVENT_TITLE_PREFIX,
  composeEventTitle,
  firstAddressSegment,
} from '@/collections/Events/hooks/eventTitle'

/**
 * Minimal PayloadRequest stub — resolveTitlePrefix only touches `context` and
 * `payload.findGlobal`. We test it indirectly via the beforeChange hook.
 */
function makeReq(impl: () => Promise<Record<string, unknown>>) {
  const findGlobal = vi.fn(impl)
  const req = {
    context: {},
    payload: { findGlobal, logger: { debug: vi.fn() } },
  } as unknown as PayloadRequest
  return { req, findGlobal }
}

describe('Event title memoization (#542 bulk-import stampede guard)', () => {
  describe('helper functions', () => {
    it('extracts the first address segment', () => {
      expect(firstAddressSegment('Beethovenstraße 12, 2nd floor')).toBe('Beethovenstraße 12')
      expect(firstAddressSegment('Street Name')).toBe('Street Name')
      expect(firstAddressSegment(null)).toBe('')
    })

    it('composes event title from prefix and venue', () => {
      expect(composeEventTitle('Meditation at', 'Berlin')).toBe('Meditation at Berlin')
      expect(composeEventTitle('', 'Berlin')).toBe('Berlin')
      expect(composeEventTitle('  ', 'Berlin')).toBe('Berlin')
      expect(composeEventTitle('Meditation at', '')).toBeNull()
    })
  })

  describe('title prefix caching', () => {
    it('memoizes the in-flight promise across concurrent beforeChange hooks', async () => {
      // Simulates a bulk import: many events' beforeChange hooks fire concurrently
      // (Promise.all), all calling resolveTitlePrefix while it's still pending.
      // A value cache would issue 8 findGlobal calls; a promise cache collapses to 1.
      let resolve!: (v: Record<string, unknown>) => void
      const pending = new Promise<Record<string, unknown>>((r) => {
        resolve = r
      })
      const { req, findGlobal } = makeReq(() => pending)

      // Simulate 8 concurrent beforeChange hooks all calling resolveTitlePrefix
      // (via the eventTitleBeforeChange hook, but we test the memoization
      // directly by importing and calling resolveTitlePrefix).
      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      const hookCalls = Array.from({ length: 8 }, (_, i) => ({
        value: '', // empty title triggers prefix resolution
        data: { address: { street: `Street ${i}` } },
        originalDoc: { id: i },
        req,
      }))

      const inflight = hookCalls.map((args) =>
        eventTitleBeforeChange(args as unknown as Parameters<typeof eventTitleBeforeChange>[0]),
      )
      resolve({ event: { titlePrefix: 'Custom Prefix' } })
      const results = await Promise.all(inflight)

      // A value cache would call findGlobal 8× — all 8 clear "not cached yet" before
      // the first settles. The promise cache collapses it to one.
      expect(findGlobal).toHaveBeenCalledTimes(1)
      expect(findGlobal).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'sy-atlas-translations',
          depth: 0,
        }),
      )
      // All results should have the custom prefix
      results.forEach((result) => {
        expect(result).toMatch(/^Custom Prefix Street/)
      })
    })

    it('falls back gracefully on transient fetch failures', async () => {
      let calls = 0
      const { req, findGlobal } = makeReq(() => {
        calls += 1
        return calls === 1
          ? Promise.reject(new Error('network timeout'))
          : Promise.resolve({ event: { titlePrefix: 'Retry Success' } })
      })

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      // First call — the prefix resolution fails; resolveTitlePrefix catches
      // the error internally and falls back to DEFAULT_EVENT_TITLE_PREFIX. The
      // promise still resolves (never rejects).
      const result1 = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Street 1' } },
        originalDoc: { id: 1 },
        req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])
      expect(result1).toMatch(/^Meditation at Street 1/)
      expect(findGlobal).toHaveBeenCalledTimes(1)
    })

    it('does not share the cache across requests', async () => {
      const a = makeReq(async () => ({ event: { titlePrefix: 'Prefix A' } }))
      const b = makeReq(async () => ({ event: { titlePrefix: 'Prefix B' } }))

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      const result1 = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Street' } },
        originalDoc: { id: 1 },
        req: a.req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])

      const result2 = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Street' } },
        originalDoc: { id: 2 },
        req: b.req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])

      expect(result1).toMatch(/^Prefix A/)
      expect(result2).toMatch(/^Prefix B/)
      expect(a.findGlobal).toHaveBeenCalledTimes(1)
      expect(b.findGlobal).toHaveBeenCalledTimes(1)
    })

    it('falls back to default prefix when translations global is missing', async () => {
      const { req } = makeReq(async () => ({}))

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      const result = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Berlin' } },
        originalDoc: { id: 1 },
        req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])

      expect(result).toBe(`${DEFAULT_EVENT_TITLE_PREFIX} Berlin`)
    })
  })
})
