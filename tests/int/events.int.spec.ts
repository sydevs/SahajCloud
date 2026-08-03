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
    let clientUser: { id: number; collection: 'clients'; _status: 'published'; roles: string[] }
    let finishedId: number
    let runningId: number

    beforeAll(async () => {
      const manager = await testData.createManager(payload, {
        name: 'List Manager',
        email: 'list-manager@example.com',
      })
      const clientDoc = await testData.createClient(payload, manager.id, {
        name: 'Atlas List Client',
        roles: ['sahaj-atlas-client'],
      })
      clientUser = {
        id: clientDoc.id,
        collection: 'clients',
        _status: 'published',
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
        // `region` / `_status` are injected by ensureWebPathDeps so the paths resolve.
        select: { title: true, webPath: true, webUrl: true },
        user: clientUser as never,
        overrideAccess: false,
      })
      expect(doc.id).toBe(finishedId)
      // Absent from the declared select on purpose: getting it back is what
      // proves ensureWebPathDeps injected it, so the type needs widening here.
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
  })

  describe('website field', () => {
    // The field deliberately isn't `localized` — one URL is shared by every
    // locale. Config introspection can't prove this (Payload strips
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
})
