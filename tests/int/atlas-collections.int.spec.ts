import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Custom-logic coverage for the Phase 2 Atlas collections:
 * - Regions `eventDefaults` (language + timeZone) ancestor inheritance (afterRead hook)
 * - Events `title` auto-fill from the street address (beforeChange hook)
 *
 * Built-in Payload behavior (joins, relationships, drafts, nested-docs
 * breadcrumbs) is intentionally not re-tested.
 */
describe('Atlas collections', () => {
  let payload: Payload
  let cleanup: (() => Promise<void>) | undefined
  let managerId: number

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    managerId = env.adminUser.id
  })

  afterAll(async () => {
    await cleanup?.()
  })

  describe('Regions slug', () => {
    it('auto-generates a transliterated slug from a non-Latin (Cyrillic) name', async () => {
      const region = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: {
          name: 'Москва',
          level: 'city',
          mapboxId: 'slug-cyrillic-city',
          managers: [managerId],
        },
      })
      expect(region.slug).toBe('moskva')
    })
  })

  describe('Regions eventDefaults inheritance', () => {
    it('inherits language + timeZone from the nearest ancestor when blank, and tracks the nearest', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: {
          name: 'Country',
          level: 'country',
          mapboxId: 'c1',
          managers: [managerId],
          eventDefaults: { language: 'en', timeZone: ['Europe/London'] },
        },
      })
      const region = await payload.create({
        collection: 'regions',
        data: {
          name: 'Region',
          level: 'region',
          mapboxId: 'r1',
          managers: [managerId],
          parent: country.id,
        },
      })
      const area = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area',
          level: 'city',
          mapboxId: 'a1',
          managers: [managerId],
          parent: region.id,
        },
      })

      // Neither region nor area set values → both inherit the country's.
      const areaRead = await payload.findByID({ collection: 'regions', id: area.id })
      expect(areaRead.eventDefaults?.language).toBe('en')
      expect(areaRead.eventDefaults?.timeZone).toEqual(['Europe/London'])

      // Give the region its own values → it becomes the area's nearest ancestor.
      await payload.update({
        collection: 'regions',
        id: region.id,
        data: { eventDefaults: { language: 'fr', timeZone: ['America/New_York'] } },
      })
      const areaAfter = await payload.findByID({ collection: 'regions', id: area.id })
      expect(areaAfter.eventDefaults?.language).toBe('fr')
      expect(areaAfter.eventDefaults?.timeZone).toEqual(['America/New_York'])
    })

    it('keeps an explicit value rather than inheriting', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: {
          name: 'Country 2',
          level: 'country',
          mapboxId: 'c2',
          managers: [managerId],
          eventDefaults: { language: 'en' },
        },
      })
      const area = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 2',
          level: 'city',
          mapboxId: 'a2',
          managers: [managerId],
          parent: country.id,
          eventDefaults: { language: 'de' },
        },
      })

      const areaRead = await payload.findByID({ collection: 'regions', id: area.id })
      expect(areaRead.eventDefaults?.language).toBe('de')
    })

    it('inherits language and timeZone independently from their nearest setters', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: {
          name: 'Country I',
          level: 'country',
          mapboxId: 'ci',
          managers: [managerId],
          eventDefaults: { language: 'en', timeZone: ['Europe/London'] },
        },
      })
      // Region sets only language → the area takes language from the region but
      // timeZone from the country (each field resolves its own nearest setter).
      const region = await payload.create({
        collection: 'regions',
        data: {
          name: 'Region I',
          level: 'region',
          mapboxId: 'ri',
          managers: [managerId],
          parent: country.id,
          eventDefaults: { language: 'fr' },
        },
      })
      const area = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area I',
          level: 'city',
          mapboxId: 'ai',
          managers: [managerId],
          parent: region.id,
        },
      })

      const areaRead = await payload.findByID({ collection: 'regions', id: area.id })
      expect(areaRead.eventDefaults?.language).toBe('fr')
      expect(areaRead.eventDefaults?.timeZone).toEqual(['Europe/London'])
    })

    it('resolves inheritance across rows in one list read (shared-request memo)', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: {
          name: 'Country 3',
          level: 'country',
          mapboxId: 'c3',
          managers: [managerId],
          eventDefaults: { language: 'en' },
        },
      })
      const blankA = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 3a',
          level: 'city',
          mapboxId: 'a3a',
          managers: [managerId],
          parent: country.id,
        },
      })
      const blankB = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 3b',
          level: 'city',
          mapboxId: 'a3b',
          managers: [managerId],
          parent: country.id,
        },
      })
      const explicit = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 3c',
          level: 'city',
          mapboxId: 'a3c',
          managers: [managerId],
          parent: country.id,
          eventDefaults: { language: 'de' },
        },
      })

      // A single list read runs every row's afterRead against one shared req,
      // so the second blank sibling resolves the country from the per-request
      // memo rather than a second query — results must still be correct.
      const { docs } = await payload.find({
        collection: 'regions',
        where: { id: { in: [country.id, blankA.id, blankB.id, explicit.id] } },
        pagination: false,
      })
      const languageById = new Map(docs.map((doc) => [doc.id, doc.eventDefaults?.language]))

      expect(languageById.get(country.id)).toBe('en')
      expect(languageById.get(blankA.id)).toBe('en')
      expect(languageById.get(blankB.id)).toBe('en')
      expect(languageById.get(explicit.id)).toBe('de')
    })
  })

  describe('Regions parent rules', () => {
    it('limits parents to one level up, except City (Country or Region)', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: {
          name: 'PR Country',
          level: 'country',
          mapboxId: 'pr.country',
          managers: [managerId],
        },
      })
      const city = await payload.create({
        collection: 'regions',
        data: {
          name: 'PR City',
          level: 'city',
          mapboxId: 'pr.city',
          parent: country.id, // City may nest directly under a Country (Region optional)
          managers: [managerId],
        },
      })

      // A Center may only nest under a City — not directly under a Country.
      await expect(
        payload.create({
          collection: 'regions',
          data: {
            name: 'Bad Center',
            level: 'center',
            mapboxId: 'pr.center.bad',
            parent: country.id,
            managers: [managerId],
          },
        }),
      ).rejects.toThrow()
      const center = await payload.create({
        collection: 'regions',
        data: {
          name: 'Good Center',
          level: 'center',
          mapboxId: 'pr.center.good',
          parent: city.id,
          managers: [managerId],
        },
      })
      expect(center.id).toBeTruthy()

      // A Region may only nest under a Country — not a City.
      await expect(
        payload.create({
          collection: 'regions',
          data: {
            name: 'Bad Region',
            level: 'region',
            mapboxId: 'pr.region',
            parent: city.id,
            managers: [managerId],
          },
        }),
      ).rejects.toThrow()
    })
  })

  describe('Events title auto-fill', () => {
    it('auto-fills an empty title from the first segment of the street address', async () => {
      const event = await payload.create({
        collection: 'events',
        // draft: the now-required title/schedule are validated only on publish;
        // the title beforeChange hook still runs and auto-fills from the street.
        draft: true,
        data: {
          eventType: 'offline',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          address: { street: 'Hall A, Wing 2' },
        },
      })

      expect(event.title).toBe('Meditation at Hall A')
    })

    it('keeps an explicitly provided title', async () => {
      const event = await payload.create({
        collection: 'events',
        draft: true,
        data: {
          title: 'Diwali Special',
          eventType: 'offline',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          address: { street: 'Hall A' },
        },
      })

      expect(event.title).toBe('Diwali Special')
    })

    it('leaves the title empty when there is no street to build from', async () => {
      const event = await payload.create({
        collection: 'events',
        draft: true,
        data: {
          eventType: 'online',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
        },
      })

      expect(event.title ?? null).toBeNull()
    })
  })
})
