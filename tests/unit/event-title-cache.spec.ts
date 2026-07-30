import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  composeEventTitle,
  EVENT_TITLE_DEFAULTS,
  firstAddressSegment,
} from '@/collections/Events/hooks/eventTitle'

/**
 * Minimal PayloadRequest stub — resolveTitleTemplates only touches `context` and
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

/** A schedule whose local start time lands in the given slot. */
const eveningSchedule = { firstDate: '2024-09-06T17:30:00.000Z', firstDate_tz: 'UTC' }

describe('Event title memoization (#542 bulk-import stampede guard)', () => {
  describe('helper functions', () => {
    it('extracts the first address segment', () => {
      expect(firstAddressSegment('Beethovenstraße 12, 2nd floor')).toBe('Beethovenstraße 12')
      expect(firstAddressSegment('Street Name')).toBe('Street Name')
      expect(firstAddressSegment(null)).toBe('')
    })

    it('interpolates %{place} into the template', () => {
      expect(composeEventTitle('Meditation at %{place}', 'Berlin')).toBe('Meditation at Berlin')
      expect(composeEventTitle('Meditation at %{place}', '')).toBeNull()
    })

    it('falls back to the place alone for a blank or placeholder-less template', () => {
      // Otherwise every event would share one fixed, place-free title.
      expect(composeEventTitle('', 'Berlin')).toBe('Berlin')
      expect(composeEventTitle('  ', 'Berlin')).toBe('Berlin')
      expect(composeEventTitle('Meditation at', 'Berlin')).toBe('Berlin')
    })
  })

  describe('title template caching', () => {
    it('memoizes the in-flight promise across concurrent beforeChange hooks', async () => {
      // Simulates a bulk import: many events' beforeChange hooks fire concurrently
      // (Promise.all), all resolving templates while the load is still pending.
      // A value cache would issue 8 findGlobal calls; a promise cache collapses to 1.
      let resolve!: (v: Record<string, unknown>) => void
      const pending = new Promise<Record<string, unknown>>((r) => {
        resolve = r
      })
      const { req, findGlobal } = makeReq(() => pending)

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      const hookCalls = Array.from({ length: 8 }, (_, i) => ({
        value: '', // empty title triggers template resolution
        data: { address: { street: `Street ${i}` }, schedule: eveningSchedule },
        originalDoc: { id: i },
        req,
      }))

      const inflight = hookCalls.map((args) =>
        eventTitleBeforeChange(args as unknown as Parameters<typeof eventTitleBeforeChange>[0]),
      )
      resolve({ event: { title: { evening: 'Custom Evening at %{place}' } } })
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
      results.forEach((result) => {
        expect(result).toMatch(/^Custom Evening at Street/)
      })
    })

    it('falls back gracefully on transient fetch failures', async () => {
      let calls = 0
      const { req, findGlobal } = makeReq(() => {
        calls += 1
        return calls === 1
          ? Promise.reject(new Error('network timeout'))
          : Promise.resolve({ event: { title: { evening: 'Retry Success at %{place}' } } })
      })

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      // The load fails; resolveTitleTemplates catches the error internally and
      // falls back to EVENT_TITLE_DEFAULTS. The promise still resolves.
      const result1 = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Street 1' }, schedule: eveningSchedule },
        originalDoc: { id: 1 },
        req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])
      expect(result1).toBe('Evening Meditation at Street 1')
      expect(findGlobal).toHaveBeenCalledTimes(1)
    })

    it('does not share the cache across requests', async () => {
      const a = makeReq(async () => ({ event: { title: { evening: 'A at %{place}' } } }))
      const b = makeReq(async () => ({ event: { title: { evening: 'B at %{place}' } } }))

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      const result1 = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Street' }, schedule: eveningSchedule },
        originalDoc: { id: 1 },
        req: a.req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])

      const result2 = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Street' }, schedule: eveningSchedule },
        originalDoc: { id: 2 },
        req: b.req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])

      expect(result1).toBe('A at Street')
      expect(result2).toBe('B at Street')
      expect(a.findGlobal).toHaveBeenCalledTimes(1)
      expect(b.findGlobal).toHaveBeenCalledTimes(1)
    })

    it('falls back per slot when the global omits it', async () => {
      // Payload falls back per *field*, not per key, so a translated blob that
      // defines only some slots would otherwise yield undefined for the rest.
      const { req } = makeReq(async () => ({
        event: { title: { morning: 'Ochtendmeditatie bij %{place}' } },
      }))

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      const morning = await eventTitleBeforeChange({
        value: '',
        data: {
          address: { street: 'Berlin' },
          schedule: { firstDate: '2024-09-06T09:00:00.000Z', firstDate_tz: 'UTC' },
        },
        originalDoc: { id: 1 },
        req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])
      const evening = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Berlin' }, schedule: eveningSchedule },
        originalDoc: { id: 2 },
        req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])

      expect(morning).toBe('Ochtendmeditatie bij Berlin')
      expect(evening).toBe('Evening Meditation at Berlin')
    })

    it('falls back to the English defaults when the global is empty', async () => {
      const { req } = makeReq(async () => ({}))

      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')

      const result = await eventTitleBeforeChange({
        value: '',
        data: { address: { street: 'Berlin' }, schedule: eveningSchedule },
        originalDoc: { id: 1 },
        req,
      } as unknown as Parameters<typeof eventTitleBeforeChange>[0])

      expect(result).toBe(EVENT_TITLE_DEFAULTS.evening.replace('%{place}', 'Berlin'))
    })
  })
})
