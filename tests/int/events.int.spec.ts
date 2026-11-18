import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Event } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Events collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // Finished events drop out of API-client list reads (#603). They stay
  // published so their Atlas pages keep resolving, so this filter is the only
  // thing keeping them out of the listing.
  // ──────────────────────────────────────────────────────────────────────────
  describe('finished events in client list reads', () => {
    let clientUser: { id: number; collection: 'clients'; enabled: true; roles: string[] }
    let finishedId: number
    let runningId: number

    beforeAll(async () => {
      const manager = await testData.createManager(payload, {
        name: 'List Manager',
        email: 'list-manager@example.com',
      })
      const clientDoc = await testData.createClient(payload, manager.id, {
        label: 'Atlas List Client',
        roles: ['sahaj-atlas-client'],
      })
      clientUser = {
        id: clientDoc.id,
        collection: 'clients',
        enabled: true,
        roles: ['sahaj-atlas-client'],
      }

      const finished = await testData.createEvent(payload, {
        title: 'Finished Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/finished',
        // A one-off five years back — long finished.
        schedule: { firstDate: '2021-04-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
        _status: 'published',
      } as never)
      finishedId = finished.id

      const running = await testData.createEvent(payload, {
        title: 'Running Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/running',
        // Open-ended daily — never finishes.
        schedule: {
          firstDate: '2021-04-01T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          recurrenceType: 'DAILY',
          interval: 1,
        },
        _status: 'published',
      } as never)
      runningId = running.id
    })

    // ⚠ Deliberately passes no `draft`, so Payload supplies it. That is the
    // argument `isVersionsRead` keys off (#745): adding `draft` here would make
    // the cases below stop pinning the guard's false branch, and a Payload
    // upgrade that stopped supplying it would switch this filter off unnoticed.
    const listIds = async (args: Record<string, unknown> = {}) => {
      const { docs } = await payload.find({
        collection: 'events',
        limit: 100,
        depth: 0,
        select: { title: true },
        user: clientUser as never,
        overrideAccess: false,
        ...args,
      })
      return docs.map((doc) => doc.id)
    }

    it('omits finished events for an API client by default', async () => {
      const ids = await listIds()
      expect(ids).toContain(runningId)
      expect(ids).not.toContain(finishedId)
    })

    it('counts the filtered set, not the raw one', async () => {
      const { totalDocs } = await payload.count({
        collection: 'events',
        user: clientUser as never,
        overrideAccess: false,
      })
      const ids = await listIds()
      expect(totalDocs).toBe(ids.length)
    })

    it('lets an explicit where on schedule.lastDate opt out', async () => {
      const ids = await listIds({ where: { 'schedule.lastDate': { exists: true } } })
      expect(ids).toContain(finishedId)
    })

    // The dotted path is the only form the opt-out needs to recognise: Payload's
    // query validation rejects the nested-group shape outright, so it can never
    // reach the hook.
    it('rejects the nested-group form of the path (so the hook needn’t handle it)', async () => {
      await expect(
        listIds({ where: { schedule: { lastDate: { exists: true } } } }),
      ).rejects.toThrow(/cannot be queried/)
    })

    it('honours the opt-out nested inside a compound where', async () => {
      const ids = await listIds({
        where: {
          and: [
            { eventType: { equals: 'online' } },
            { or: [{ 'schedule.lastDate': { exists: true } }] },
          ],
        },
      })
      expect(ids).toContain(finishedId)
    })

    it('still resolves a finished event via findByID, with a public URL', async () => {
      const doc = await payload.findByID({
        collection: 'events',
        id: finishedId,
        depth: 0,
        // API clients must declare a select (the usage plugin's client gate).
        // `region` / `_status` are injected by ensureVirtualFieldDeps so the paths resolve.
        select: { title: true, webPath: true, webUrl: true },
        user: clientUser as never,
        overrideAccess: false,
      })
      expect(doc.id).toBe(finishedId)
      // Absent from the declared select on purpose: getting it back is what
      // proves ensureVirtualFieldDeps injected it, so the type needs widening here.
      expect((doc as typeof doc & Pick<Event, '_status'>)._status).toBe('published')
      // Publish-gated, so a non-null path proves nothing unpublished it.
      expect(doc.webPath).toBeTruthy()
      expect(doc.webUrl).toBeTruthy()
    })

    it('leaves admin and internal reads untouched', async () => {
      const { docs } = await payload.find({
        collection: 'events',
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
      expect(docs.map((doc) => doc.id)).toContain(finishedId)
    })

    /**
     * The hook must decline a versions read: `schedule.lastDate` is not a
     * queryable path on the versions collection (#745 — see
     * `src/lib/utilities/versionsRead.ts`).
     *
     * API clients must still declare a `select` on any read, versions included
     * — that is `validateClientQueryParamsHook`, a separate `read` hook.
     */
    describe('versions reads (#745)', () => {
      const versionSelect = { version: true } as const

      it('resolves when the access gate is bypassed', async () => {
        // The regression pin. `overrideAccess: true` skips the access gate, so
        // this is the one shape that reaches query validation as a client — an
        // internal read forwarding a client's `req`. Deleting the guard from
        // the hook turns this red with "path cannot be queried".
        const versions = await payload.findVersions({
          collection: 'events',
          select: versionSelect,
          depth: 0,
          user: clientUser as never,
          overrideAccess: true,
        })

        expect(versions.totalDocs).toBeGreaterThan(0)
      })

      it('answers an ordinary client with the access decision', async () => {
        // Passes before the fix too: `findVersions` runs the access gate BEFORE
        // query validation, and no client role grants events `update` (#719).
        // Kept for the message — a bare `rejects.toThrow()` accepts a 400.
        await expect(
          payload.findVersions({
            collection: 'events',
            select: versionSelect,
            depth: 0,
            user: clientUser as never,
            overrideAccess: false,
          }),
        ).rejects.toThrow('You are not allowed to perform this action.')
      })
    })
  })

  describe('website field', () => {
    // The field deliberately is not `localized` — one URL is shared by every
    // locale. Config introspection cannot prove this (Payload strips
    // `localized` during sanitization), so assert it functionally.
    it('shares one value across locales', async () => {
      const event = await testData.createEvent(payload, {
        website: 'https://example.com/weekly-class',
      })

      const inCzech = await payload.findByID({
        collection: 'events',
        id: event.id,
        locale: 'cs',
        fallbackLocale: false,
      })
      // A localized column would be empty here with the fallback disabled.
      expect(inCzech.website).toBe('https://example.com/weekly-class')
    })

    // Proves the urlField() validator is actually wired onto this field — a
    // plain `type: 'text'` field would accept this. tests/unit/url-field.spec.ts
    // covers the validator's own logic.
    it('rejects a value that is not an http(s) URL', async () => {
      try {
        await testData.createEvent(payload, { website: 'not-a-url' })
        throw new Error('expected create to throw — an invalid URL should be rejected')
      } catch (err) {
        // Payload's ValidationError exposes per-field messages on `.data.errors`.
        const data = (err as { data?: { errors?: Array<{ path: string; message: string }> } }).data
        const fieldErr = (data?.errors ?? []).find((e) => e.path === 'website')
        expect(fieldErr?.message).toBe('Please enter a valid URL')
      }
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // One control stores the pace and the dormant state. `inactive` keeps its
  // place in the API as a computed field, because the widget and the
  // We Meditate site both read it.
  // ──────────────────────────────────────────────────────────────────────────
  describe('repeats', () => {
    it('writes the schedule’s own recurrence from the chosen pace', async () => {
      const event = await testData.createEvent(payload, {
        repeats: 'weekly',
        schedule: {
          firstDate: '2026-01-05T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          interval: 1,
          weekdays: ['MO'],
        },
      })

      expect(event.schedule?.recurrenceType).toBe('WEEKLY')
    })

    it('clears the recurrence for a pace that does not repeat', async () => {
      const event = await testData.createEvent(payload, {
        repeats: 'once',
        schedule: {
          firstDate: '2026-01-05T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          recurrenceType: 'WEEKLY',
          interval: 1,
          weekdays: ['MO'],
        },
      })

      expect(event.schedule?.recurrenceType ?? null).toBeNull()
    })

    it('answers the dormant state as `inactive`, selected on its own', async () => {
      const dormant = await testData.createEvent(payload, { repeats: 'inactive' })
      const weekly = await testData.createEvent(payload, {
        repeats: 'weekly',
        schedule: {
          firstDate: '2026-01-05T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          interval: 1,
          weekdays: ['MO'],
        },
      })

      expect(dormant.inactive).toBe(true)
      expect(weekly.inactive).toBe(false)

      // `select` strips the stored input the hook reads, so a field declaring
      // its own inputs is what keeps this non-null (`@/plugins/virtualFields`).
      const narrowed = await payload.findByID({
        collection: 'events',
        id: dormant.id,
        select: { inactive: true },
      })
      expect(narrowed.inactive).toBe(true)

      // And through a list read, which runs the same hook per row.
      const { docs } = await payload.find({
        collection: 'events',
        where: { id: { in: [dormant.id, weekly.id] } },
        select: { inactive: true },
      })
      expect(docs.map((doc) => [doc.id, doc.inactive])).toEqual(
        expect.arrayContaining([
          [dormant.id, true],
          [weekly.id, false],
        ]),
      )
    })

    // `syncScheduleRecurrence` patches the group with `recurrenceType` alone,
    // resting on Payload filling the rest from the stored group. `mergedSchedule`
    // next door exists because a collection hook gets no such merge on read, so
    // the claim is pinned here rather than assumed.
    it('keeps the rest of the schedule when a pace change names no schedule', async () => {
      const event = await testData.createEvent(payload, {
        repeats: 'weekly',
        schedule: {
          firstDate: '2026-01-05T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          interval: 1,
          weekdays: ['MO'],
        },
      })

      const repaced = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: { repeats: 'monthly' },
      })

      expect(repaced.schedule?.recurrenceType).toBe('MONTHLY')
      expect(repaced.schedule?.firstDate).toBe('2026-01-05T10:00:00.000Z')
      expect(repaced.schedule?.firstDate_tz).toBe('Europe/London')
      expect(repaced.schedule?.interval).toBe(1)
    })
  })

  describe('allowContact', () => {
    it('clears all three contact fields on the save that switches it off', async () => {
      const event = await testData.createEvent(payload, {
        allowContact: true,
        contactEmail: 'reach@example.com',
        contactName: 'Reachable Person',
        contactPhone: '+44 20 7000 1000',
        repeats: 'weekly',
        schedule: {
          firstDate: '2026-01-05T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          interval: 1,
          weekdays: ['MO'],
        },
      })

      const closed = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: { allowContact: false },
      })

      expect(closed.allowContact).toBe(false)
      expect(closed.contactPhone ?? null).toBeNull()
      expect(closed.contactEmail ?? null).toBeNull()
      expect(closed.contactName ?? null).toBeNull()
    })

    // Two refusals, and each has to be provable on its own: a phone the box
    // hides reaches nobody, and a checked box with nothing in it reaches
    // nobody either. The phone here is what leaves the box as the only
    // possible objection.
    it('refuses a dormant class whose contact box is off', async () => {
      await expect(
        testData.createEvent(payload, {
          repeats: 'inactive',
          allowContact: false,
          contactPhone: '+44 20 7000 2000',
        }),
      ).rejects.toThrow(/Allow seekers to contact/i)
    })

    it('refuses a dormant class whose contact box is on but empty', async () => {
      await expect(
        testData.createEvent(payload, {
          repeats: 'inactive',
          allowContact: true,
          contactName: null,
          contactPhone: null,
          contactEmail: null,
        }),
      ).rejects.toThrow(/Contact Phone Number/i)
    })
  })
})
