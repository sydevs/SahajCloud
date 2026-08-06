import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import {
  composeEventTitle,
  EVENT_TITLE_DEFAULTS,
  firstAddressSegment,
} from '@/lib/eventTitle/compose'

/**
 * Minimal PayloadRequest stub — resolveTitleTemplates only touches `context` and
 * `payload.findGlobal`. We test it indirectly via the beforeChange hook.
 */
function makeReq(
  impl: () => Promise<Record<string, unknown>>,
  findByIDImpl: () => Promise<Record<string, unknown>> = async () => ({ name: 'Toronto' }),
) {
  const findGlobal = vi.fn(impl)
  const findByID = vi.fn(findByIDImpl)
  const req = {
    context: {},
    payload: { findGlobal, findByID, logger: { debug: vi.fn() } },
  } as unknown as PayloadRequest
  return { req, findGlobal, findByID }
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
      expect(composeEventTitle('Meditation at %{place}', { street: 'Berlin' })).toBe(
        'Meditation at Berlin',
      )
      expect(composeEventTitle('Meditation at %{place}', { street: '' })).toBeNull()
    })

    it('falls back to the place alone for a blank or placeholder-less template', () => {
      // Otherwise every event would share one fixed, place-free title.
      expect(composeEventTitle('', { street: 'Berlin' })).toBe('Berlin')
      expect(composeEventTitle('  ', { street: 'Berlin' })).toBe('Berlin')
      expect(composeEventTitle('Meditation at', { street: 'Berlin' })).toBe('Berlin')
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

  describe('the region fallback (an online event has no address)', () => {
    const call = async (
      req: PayloadRequest,
      data: Record<string, unknown>,
      originalDoc: Record<string, unknown> = { id: 1 },
    ) => {
      const { eventTitleBeforeChange } = await import('@/collections/Events/hooks/eventTitle')
      return eventTitleBeforeChange({ value: '', data, originalDoc, req } as unknown as Parameters<
        typeof eventTitleBeforeChange
      >[0])
    }

    it('names the event after its region, reading only the name', async () => {
      const { req, findByID } = makeReq(async () => ({}))
      const result = await call(req, { region: 42, schedule: eveningSchedule })

      expect(result).toBe('Evening Meditation at Toronto')
      expect(findByID).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'regions', id: 42, select: { name: true } }),
      )
    })

    it('prefers the address, so a venue never pays for a region read', async () => {
      const { req, findByID } = makeReq(async () => ({}))
      const result = await call(req, {
        address: { venueName: 'Sunrise Hall' },
        region: 42,
        schedule: eveningSchedule,
      })

      expect(result).toBe('Evening Meditation at Sunrise Hall')
      expect(findByID).not.toHaveBeenCalled()
    })

    it('collapses a batch of events in one region to a single read', async () => {
      // The same stampede guard as the templates above: the Atlas seed saves
      // events in batches, and a city's online events all resolve one name.
      const { req, findByID } = makeReq(async () => ({}))
      const results = await Promise.all(
        [1, 2, 3, 4].map((id) => call(req, { region: 42, schedule: eveningSchedule }, { id })),
      )

      expect(findByID).toHaveBeenCalledTimes(1)
      results.forEach((result) => expect(result).toBe('Evening Meditation at Toronto'))
    })

    it('refuses the save when there is no place left to name it', async () => {
      // The guarantee lives here, not in `required`: eventTitleValidate has to
      // permit a blank title for the browser's sake, so a failed region read
      // would otherwise store one. A trashed region reads as NotFound.
      const { req } = makeReq(
        async () => ({}),
        () => Promise.reject(new Error('NotFound')),
      )

      await expect(call(req, { region: 42, schedule: eveningSchedule })).rejects.toThrow(/title/i)
      await expect(call(req, { schedule: eveningSchedule })).rejects.toThrow(/title/i)
    })
  })
})
