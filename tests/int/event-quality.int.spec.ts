import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { QUALITY_CHECK_VERSION } from '@/lib/eventQuality'
import type { EventQualityReport } from '@/lib/eventQuality/types'
import type { Event } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Wiring-level behaviour of the listing-quality checks (#609) — everything the
 * pure unit lane can't reach: which hooks fire, what the stored columns hold
 * after a partial write, and what a read costs. The check logic itself is
 * covered in `tests/unit/event-quality-checks.spec.ts`.
 */
describe('Event listing quality', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let managerId: number
  let regionId: number

  const report = (doc: Event): EventQualityReport =>
    doc.qualityReport as unknown as EventQualityReport

  /** A published, verified event — anything else short-circuits to `skipped`. */
  const createPublished = async (overrides: Record<string, unknown> = {}): Promise<Event> =>
    testData.createEvent(payload, {
      manager: managerId,
      region: regionId,
      _status: 'published',
      verificationStage: 'verified',
      ...overrides,
    } as never)

  /**
   * Put an event on a terminal stage. `verifyOnSave` resets `verificationStage`
   * to `verified` on every manager save, so a stage passed to `create` never
   * survives — `skipVerifyHook` is the same escape hatch the ExpireEvents job
   * uses to advance a stage.
   */
  const setStage = async (id: number, data: Record<string, unknown>): Promise<Event> =>
    payload.update({
      collection: 'events',
      id,
      data: data as never,
      context: { skipVerifyHook: true },
    })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Quality Manager',
      email: 'quality-manager@example.com',
    })
    managerId = manager.id
    const region = await testData.createRegion(payload)
    regionId = region.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the virtual report field', () => {
    it('keeps the title unlocalized, so the report needs no per-locale read', async () => {
      // Asserted functionally, not by config introspection: Payload strips
      // `localized` during sanitization, so `expect(field.localized).toBeFalsy()`
      // passes whether or not the field is localized — a vacuous test. Writing
      // in one locale and reading another with the fallback off is the only
      // thing that actually proves it. Same approach as the `website` case in
      // events.int.spec.ts.
      const event = await createPublished({ title: 'Evening Sitting for Carers' })
      await payload.update({
        collection: 'events',
        id: event.id,
        locale: 'cs',
        data: { title: 'Podvečerní meditace' },
      })

      const inEnglish = await payload.findByID({
        collection: 'events',
        id: event.id,
        locale: 'en',
        fallbackLocale: false as never,
      })
      // One column: the Czech write landed on the same value English reads.
      expect(inEnglish.title).toBe('Podvečerní meditace')
    })

    it('fills a blank title from the venue rather than refusing it', async () => {
      // `required: true` holds, but the field's beforeChange hook fills the
      // value before validation runs — so leaving it blank is a supported
      // workflow, not an omission. (The browser has no hook, which is why
      // `eventTitleValidate` permits the blank case too; see its unit spec.)
      const event = await testData.createEvent(payload, {
        manager: managerId,
        region: regionId,
        _status: 'published',
        title: '',
        inactive: false,
        eventType: 'offline',
        address: {
          venueName: 'Sunrise Hall',
          street: 'Hauptstr 1',
          city: 'Bremen',
          country: 'DE',
          latitude: 53,
          longitude: 8,
        },
        schedule: { firstDate: '2030-04-01T18:00:00.000Z', firstDate_tz: 'Europe/Berlin' },
      } as never)
      expect(event.title).toBe('Evening Meditation at Sunrise Hall')
    })

    it('names an online event after its region, having no venue to name it', async () => {
      // An online event has no address at all, so the auto-fill composes from
      // the region it hangs off instead. `region` is required, so every event
      // has *something* to be named after — which is what keeps `title`'s own
      // `required` satisfiable no matter how the manager fills the form.
      const region = await testData.createRegion(payload, { name: 'Toronto' })
      const event = await testData.createEvent(payload, {
        manager: managerId,
        region: region.id,
        _status: 'published',
        title: '',
        inactive: false,
        eventType: 'online',
        onlineUrl: 'https://meet.example.org/room',
        schedule: { firstDate: '2030-04-01T18:00:00.000Z', firstDate_tz: 'Europe/Berlin' },
      } as never)
      expect(event.title).toBe('Evening Meditation at Toronto')
    })

    it('prefers the venue over the region when the event has both', async () => {
      const region = await testData.createRegion(payload, { name: 'Bremen' })
      const event = await testData.createEvent(payload, {
        manager: managerId,
        region: region.id,
        _status: 'published',
        title: '',
        inactive: false,
        eventType: 'offline',
        address: {
          venueName: 'Sunrise Hall',
          street: 'Hauptstr 1',
          city: 'Bremen',
          country: 'DE',
          latitude: 53,
          longitude: 8,
        },
        schedule: { firstDate: '2030-04-01T18:00:00.000Z', firstDate_tz: 'Europe/Berlin' },
      } as never)
      expect(event.title).toBe('Evening Meditation at Sunrise Hall')
    })

    it('rejects a link in the title, and still enforces the length cap', async () => {
      await expect(
        createPublished({ title: 'Meditation https://example.org/classes' }),
      ).rejects.toThrow()
      await expect(createPublished({ title: 'x'.repeat(101) })).rejects.toThrow()
      // The cap and the link rule share one validator, so prove the ordinary
      // case still saves.
      const fine = await createPublished({ title: 'Evening Sitting for Carers' })
      expect(fine.title).toBe('Evening Sitting for Carers')
    })

    it.each([
      ['unpublished', { _status: 'draft' }, 'unpublished'],
      ['finished', { verificationStage: 'finished' }, 'finished'],
      ['expired', { verificationStage: 'expired', _status: 'draft' }, 'expired'],
    ])('returns skipped with a reason for a %s event', async (_label, overrides, reason) => {
      const event = await createPublished({ title: `Skip ${reason}` })
      await setStage(event.id, overrides)
      const fresh = await payload.findByID({ collection: 'events', id: event.id })
      expect(report(fresh)).toEqual({ skipped: true, reason })
    })

    it('can still be updated once trashed — what the Atlas importer needs', async () => {
      // Payload appends `deletedAt exists: false` to every read on a
      // trash-enabled collection, so an update targeting a trashed row throws
      // `Not Found` unless it passes `trash: true`. Two archived Atlas events
      // failed on every seed run until `upsert` did — on *both* its paths, the
      // preloaded one included. See .claude/rules/collections.md.
      const event = await createPublished({ title: 'Archived Sitting' })
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { deletedAt: new Date().toISOString() },
      })

      await expect(
        payload.update({
          collection: 'events',
          id: event.id,
          data: { contactName: 'Importer' },
        }),
      ).rejects.toThrow()

      const updated = await payload.update({
        collection: 'events',
        id: event.id,
        data: { contactName: 'Importer' },
        trash: true,
      })
      expect(updated.contactName).toBe('Importer')
    })

    it('returns skipped for a trashed event', async () => {
      const event = await createPublished({ title: 'Trashed Sitting' })
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { deletedAt: new Date().toISOString() },
      })
      const fresh = await payload.findByID({ collection: 'events', id: event.id, trash: true })
      expect(report(fresh)).toEqual({ skipped: true, reason: 'trashed' })
    })

    it('checks a published unverified event — the adopting manager’s to-do list', async () => {
      const event = await createPublished({
        title: 'Unverified Sitting',
        manager: null,
        verificationStage: 'unverified',
      })
      const fresh = await payload.findByID({ collection: 'events', id: event.id })
      const built = report(fresh)
      expect(built.skipped).toBe(false)
      if (!built.skipped) expect(built.checks.length).toBeGreaterThan(0)
    })

    it('returns skipped (denied) for a community-rejected event', async () => {
      const event = await createPublished({
        title: 'Denied Sitting',
        manager: null,
        verificationStage: 'unverified',
      })
      await setStage(event.id, { verificationStage: 'denied', _status: 'draft' })
      const fresh = await payload.findByID({ collection: 'events', id: event.id, draft: true })
      expect(report(fresh)).toEqual({ skipped: true, reason: 'denied' })
    })
  })

  describe('read cost', () => {
    it('computes no report for a list read', async () => {
      // The report costs two extra queries. Paying that per row to render a
      // list nobody reads it in is the one thing that would make this
      // expensive — the list view sorts on qualityOpenCount instead.
      await createPublished({ title: 'Listed Sitting One' })
      await createPublished({ title: 'Listed Sitting Two' })

      const list = await payload.find({ collection: 'events', limit: 50 })
      expect(list.docs.length).toBeGreaterThan(1)
      for (const doc of list.docs) {
        expect(doc.qualityReport).toBeNull()
      }
    })

    it('computes no report for a system write', async () => {
      // The Atlas importer and the ExpireEvents job both set skipVerifyHook on
      // their writes. Payload runs afterRead on the doc an update returns, so
      // without this a 500-event import pays two extra queries per event for a
      // report nothing reads.
      const event = await createPublished({ title: 'System Written Sitting' })
      const updated = await payload.update({
        collection: 'events',
        id: event.id,
        data: { contactName: 'Importer' },
        context: { skipVerifyHook: true },
      })
      expect(updated.qualityReport).toBeNull()

      // A normal read still gets the report.
      const fresh = await payload.findByID({ collection: 'events', id: event.id })
      expect(report(fresh).skipped).toBe(false)
    })

    it('is excluded when an event is hydrated through a relationship', async () => {
      // defaultPopulate — a direct query always includes virtual fields, so
      // this has to be tested through a populating relationship.
      const event = await createPublished({
        title: 'Registrable Sitting',
        inactive: false,
        eventType: 'online',
        onlineUrl: 'https://example.org/join',
        schedule: { firstDate: '2030-04-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
      })
      const user = await payload.create({
        collection: 'users',
        data: { email: 'seeker@example.org', name: 'Seeker' } as never,
      })
      const registration = await payload.create({
        collection: 'registrations',
        data: { event: event.id, user: user.id, uuid: `quality-${event.id}` } as never,
      })
      const hydrated = await payload.findByID({
        collection: 'registrations',
        id: registration.id,
        depth: 1,
      })
      const populated = (hydrated as { event: Event }).event
      expect(populated.id).toBe(event.id)
      expect(populated.qualityReport).toBeFalsy()
    })
  })

  describe('the stored columns', () => {
    it('stamps the count and the check version on create', async () => {
      const event = await createPublished({ title: 'Counted Sitting' })
      // No description and no photos on the fixture → two open items.
      expect(event.qualityOpenCount).toBe(2)
      expect(event.qualityCheckVersion).toBe(QUALITY_CHECK_VERSION)
    })

    it('leaves the count intact when an unrelated field is patched', async () => {
      // A field hook computing off its own sibling data would NULL the column
      // here — Payload materialises {} for anything the patch omits.
      const event = await createPublished({ title: 'Patched Sitting' })
      const before = event.qualityOpenCount
      expect(before).toBeGreaterThan(0)

      const patched = await payload.update({
        collection: 'events',
        id: event.id,
        data: { contactName: 'Someone Else' },
      })
      expect(patched.qualityOpenCount).toBe(before)
      expect(patched.qualityCheckVersion).toBe(QUALITY_CHECK_VERSION)
    })

    it('recomputes the count when the listing actually improves', async () => {
      const event = await createPublished({ title: 'Improving Sitting' })
      const before = event.qualityOpenCount ?? 0

      const improved = await payload.update({
        collection: 'events',
        id: event.id,
        data: { images: [] as never, description: null } as never,
      })
      expect(improved.qualityOpenCount).toBe(before)

      // Attaching nothing changes nothing; writing a real description does.
      const described = await payload.update({
        collection: 'events',
        id: event.id,
        data: {
          description: {
            root: {
              type: 'root',
              children: [
                {
                  type: 'paragraph',
                  children: [
                    {
                      type: 'text',
                      text: 'A quiet hour for anyone who works nights. No experience needed, and nothing to bring.',
                      version: 1,
                    },
                  ],
                  version: 1,
                },
              ],
              direction: null,
              format: '',
              indent: 0,
              version: 1,
            },
          },
        } as never,
      })
      expect(described.qualityOpenCount).toBe(before - 1)
    })

    it('agrees with the report it is stamped from', async () => {
      const event = await createPublished({ title: 'Meditation', languages: ['de', 'fr'] })
      const fresh = await payload.findByID({ collection: 'events', id: event.id })
      const result = report(fresh)
      if (result.skipped) throw new Error('expected a report')
      expect(fresh.qualityOpenCount).toBe(result.openCount)
      expect(result.openCount).toBe(result.checks.filter((r) => r.status === 'failed').length)
    })
  })
})
