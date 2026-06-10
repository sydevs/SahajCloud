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

  describe('Regions eventDefaults inheritance', () => {
    it('inherits language + timeZone from the nearest ancestor when blank, and tracks the nearest', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: {
          name: 'Country',
          level: 'country',
          mapboxId: 'c1',
          eventDefaults: { language: 'en', timeZone: ['Europe/London'] },
        },
      })
      const region = await payload.create({
        collection: 'regions',
        data: { name: 'Region', level: 'region', mapboxId: 'r1', parent: country.id },
      })
      const area = await payload.create({
        collection: 'regions',
        data: { name: 'Area', level: 'city', mapboxId: 'a1', parent: region.id },
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
          eventDefaults: { language: 'en' },
        },
      })
      const area = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 2',
          level: 'city',
          mapboxId: 'a2',
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
          parent: country.id,
          eventDefaults: { language: 'fr' },
        },
      })
      const area = await payload.create({
        collection: 'regions',
        data: { name: 'Area I', level: 'city', mapboxId: 'ai', parent: region.id },
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
          eventDefaults: { language: 'en' },
        },
      })
      const blankA = await payload.create({
        collection: 'regions',
        data: { name: 'Area 3a', level: 'city', mapboxId: 'a3a', parent: country.id },
      })
      const blankB = await payload.create({
        collection: 'regions',
        data: { name: 'Area 3b', level: 'city', mapboxId: 'a3b', parent: country.id },
      })
      const explicit = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 3c',
          level: 'city',
          mapboxId: 'a3c',
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

  describe('Events title auto-fill', () => {
    it('auto-fills an empty title from the first segment of the street address', async () => {
      const event = await payload.create({
        collection: 'events',
        // draft: the now-required title/schedule are validated only on publish;
        // the title beforeChange hook still runs and auto-fills from the street.
        draft: true,
        data: {
          eventType: 'offline',
          status: 'active',
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
          status: 'active',
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
          status: 'active',
          registrationMode: 'sahaj-atlas',
          manager: managerId,
        },
      })

      expect(event.title ?? null).toBeNull()
    })
  })
})
