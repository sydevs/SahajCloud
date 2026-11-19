import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Event } from '@/payload-types'

import { type FixtureOverrides, testData } from '../utils/testData'
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
        inactive: false,
        eventType: 'online',
        onlineUrl: 'https://example.com/finished',
        // A one-off five years back — long finished.
        schedule: { firstDate: '2021-04-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
        _status: 'published',
      } as never)
      finishedId = finished.id

      const running = await testData.createEvent(payload, {
        title: 'Running Class',
        inactive: false,
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

  describe('allowContact', () => {
    const WEEKLY: FixtureOverrides<Event> = {
      inactive: false,
      schedule: {
        firstDate: '2026-01-05T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['MO'],
      },
    }
    const createReachableEvent = () =>
      testData.createEvent(payload, {
        ...WEEKLY,
        allowContact: true,
        contactEmail: 'reach@example.com',
        contactName: 'Reachable Person',
        contactPhone: '+44 20 7000 1000',
      })
    const setBox = (id: number, allowContact: boolean) =>
      payload.update({ collection: 'events', id, overrideAccess: true, data: { allowContact } })
    const phoneMatches = async (id: number) =>
      (
        await payload.count({
          collection: 'events',
          overrideAccess: true,
          where: { and: [{ id: { equals: id } }, { contactPhone: { contains: '+44 20 7' } }] },
        })
      ).totalDocs

    // A read gate governs the value, never the query: with the number still in
    // the row, `where[contactPhone][contains]` answers one character at a time
    // to any key holder. Re-ticking the box is what proves the column is empty,
    // since nothing else can read it and a `count` cannot be refused.
    it('withholds and empties all three contact fields while the box is off', async () => {
      const event = await createReachableEvent()

      const closed = await setBox(event.id, false)
      expect(closed.contactPhone ?? null).toBeNull()
      expect(closed.contactEmail ?? null).toBeNull()
      expect(closed.contactName ?? null).toBeNull()
      expect(await phoneMatches(event.id)).toBe(0)

      const reopened = await setBox(event.id, true)
      expect(reopened.contactPhone ?? null).toBeNull()
      expect(reopened.contactEmail ?? null).toBeNull()
      expect(reopened.contactName ?? null).toBeNull()
    })

    // A row written with the box already off never transitions, which is the
    // row a transition-only clear left queryable.
    it('leaves no contact for a where when the box was never on', async () => {
      const event = await testData.createEvent(payload, {
        ...WEEKLY,
        allowContact: false,
        contactPhone: '+44 20 7000 3000',
      })

      expect(await phoneMatches(event.id)).toBe(0)
    })

    // Naming the box `false` is an answer, as above. Leaving it out would lose
    // the phone to the clear without a word.
    it('refuses a phone written without the box while it is off', async () => {
      const event = await testData.createEvent(payload, {
        ...WEEKLY,
        allowContact: false,
        contactPhone: null,
      })

      await expect(
        payload.update({
          collection: 'events',
          id: event.id,
          overrideAccess: true,
          data: { contactPhone: '+44 20 7000 4000' },
        }),
      ).rejects.toMatchObject({
        data: {
          errors: [{ path: 'allowContact', message: expect.stringMatching(/^Switch this on/) }],
        },
      })
    })

    it('takes a phone written without the box while it is on', async () => {
      const event = await createReachableEvent()

      const updated = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        data: { contactPhone: '+44 20 7000 5000' },
      })

      expect(updated.contactPhone).toBe('+44 20 7000 5000')
    })

    // What the Atlas widget sends: `contactPhone` and `contactName`, never the
    // box. `select` strips what it does not name, so the gate reads the box
    // back through its own `virtualFieldInputs` declaration — without which
    // this answers null for every event (#1084).
    it('answers a contact through a select that names no box', async () => {
      const event = await createReachableEvent()

      const read = await payload.findByID({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        select: { contactPhone: true, contactName: true },
      })

      expect(read.contactPhone).toBe('+44 20 7000 1000')
      expect(read.contactName).toBe('Reachable Person')
    })

    // Two refusals, and each has to be provable on its own: a phone the box
    // hides reaches nobody, and a checked box with nothing in it reaches
    // nobody either. The phone here is what leaves the box as the only
    // possible objection.
    it('refuses a dormant class whose contact box is off', async () => {
      await expect(
        testData.createEvent(payload, {
          inactive: true,
          allowContact: false,
          contactPhone: '+44 20 7000 2000',
        }),
      ).rejects.toThrow(/Allow seekers to contact/i)
    })

    it('refuses a dormant class whose contact box is on but empty', async () => {
      await expect(
        testData.createEvent(payload, {
          inactive: true,
          allowContact: true,
          contactName: null,
          contactPhone: null,
          contactEmail: null,
        }),
      ).rejects.toThrow(/Contact Phone Number/i)
    })
  })
})
