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
    it('returns every evaluated locale in one read, from a non-localized field', () => {
      // A localized field would return only the active locale — structurally
      // unable to answer "which of my languages is missing a title".
      const field = payload.collections.events.config.fields
        .flatMap((f) => ('tabs' in f ? f.tabs.flatMap((t) => t.fields) : [f]))
        .find((f) => 'name' in f && f.name === 'qualityReport')
      expect(field).toBeDefined()
      expect((field as { localized?: boolean }).localized).toBeFalsy()
    })

    it('judges an event with languages: ["de"] in en + de only', async () => {
      const event = await createPublished({ title: 'Quiet Hour for Carers', languages: ['de'] })
      const fresh = await payload.findByID({ collection: 'events', id: event.id })
      const result = report(fresh)
      if (result.skipped) throw new Error(`expected a report, got ${result.reason}`)
      expect(result.locales).toEqual(['en', 'de'])
      expect(Object.keys(result.perLocale).sort()).toEqual(['de', 'en'])
    })

    it('reads every locale’s title, not just the one the read was made in', async () => {
      // Localize while the event is still a draft, then publish. A
      // locale-scoped title update on an **already published** event silently
      // doesn't persist — reproducible on `main` with none of this feature's
      // hooks attached, and not the case for a published Page, so it's an
      // Events-specific pre-existing bug rather than anything #609 introduced.
      const event = await testData.createEvent(payload, {
        manager: managerId,
        region: regionId,
        title: 'Evening Sitting for Carers',
        languages: ['de'],
      } as never)
      await payload.update({
        collection: 'events',
        id: event.id,
        locale: 'de',
        data: { title: 'Abendsitzung für Pflegende' },
      })
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { _status: 'published' } as never,
      })

      // Read in English — the German title still has to be visible to the
      // translation tier, which is the whole reason for the all-locale read.
      const fresh = await payload.findByID({ collection: 'events', id: event.id, locale: 'en' })
      const result = report(fresh)
      if (result.skipped) throw new Error(`expected a report, got ${result.reason}`)
      expect(result.perLocale.de).toContainEqual({
        key: 'translation.title.missing',
        status: 'passed',
      })
    })

    it('flags a language that has no title of its own', async () => {
      const event = await createPublished({
        title: 'Morning Sitting for Carers',
        languages: ['fr'],
      })
      const fresh = await payload.findByID({ collection: 'events', id: event.id })
      const result = report(fresh)
      if (result.skipped) throw new Error(`expected a report, got ${result.reason}`)
      expect(result.perLocale.fr).toContainEqual({
        key: 'translation.title.missing',
        status: 'failed',
      })
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
      // No description, images or website on the fixture → three open items.
      expect(event.qualityOpenCount).toBe(3)
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
        data: { website: 'https://example.org/improving' },
      })
      expect(improved.qualityOpenCount).toBe(before - 1)
    })

    it('counts document-scope items only, so it stays correct across locales', async () => {
      // The per-locale checks read localized titles a write hook can't see, so
      // a single non-localized column can't hold a cross-locale figure.
      const event = await createPublished({ title: 'Meditation', languages: ['de', 'fr'] })
      const fresh = await payload.findByID({ collection: 'events', id: event.id })
      const result = report(fresh)
      if (result.skipped) throw new Error('expected a report')
      expect(fresh.qualityOpenCount).toBe(result.openCount)
      expect(result.openCount).toBe(result.document.filter((r) => r.status === 'failed').length)
    })
  })

  describe('a locale added in the current save', () => {
    it('is reported as pending rather than failing', async () => {
      const event = await createPublished({ title: 'Expanding Sitting', languages: ['en'] })
      // The manager ticks German and saves. A translation cannot exist yet.
      const updated = await payload.update({
        collection: 'events',
        id: event.id,
        data: { languages: ['en', 'de'] },
      })
      const result = report(updated)
      if (result.skipped) throw new Error('expected a report')
      expect(result.perLocale.de).toContainEqual({
        key: 'translation.title.missing',
        status: 'pending',
      })

      // On the next read it is a real finding — the save is over.
      const later = await payload.findByID({ collection: 'events', id: event.id })
      const laterResult = report(later)
      if (laterResult.skipped) throw new Error('expected a report')
      expect(laterResult.perLocale.de).toContainEqual({
        key: 'translation.title.missing',
        status: 'failed',
      })
    })
  })
})
