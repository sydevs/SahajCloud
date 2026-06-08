import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Custom-logic coverage for the Phase 2 Atlas collections:
 * - Regions `defaultEventLanguage` ancestor inheritance (afterRead hook)
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

  describe('Regions defaultEventLanguage inheritance', () => {
    it('inherits the nearest ancestor value when blank, and tracks the nearest', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: { name: 'Country', level: 'country', osmId: 'c1', defaultEventLanguage: 'en' },
      })
      const region = await payload.create({
        collection: 'regions',
        data: { name: 'Region', level: 'region', osmId: 'r1', parent: country.id },
      })
      const area = await payload.create({
        collection: 'regions',
        data: { name: 'Area', level: 'area', osmId: 'a1', parent: region.id },
      })

      // Neither region nor area set a value → both inherit the country's 'en'.
      const areaRead = await payload.findByID({ collection: 'regions', id: area.id })
      expect(areaRead.defaultEventLanguage).toBe('en')

      // Give the region its own value → it becomes the area's nearest ancestor.
      await payload.update({
        collection: 'regions',
        id: region.id,
        data: { defaultEventLanguage: 'fr' },
      })
      const areaAfter = await payload.findByID({ collection: 'regions', id: area.id })
      expect(areaAfter.defaultEventLanguage).toBe('fr')
    })

    it('keeps an explicit value rather than inheriting', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: { name: 'Country 2', level: 'country', osmId: 'c2', defaultEventLanguage: 'en' },
      })
      const area = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 2',
          level: 'area',
          osmId: 'a2',
          parent: country.id,
          defaultEventLanguage: 'de',
        },
      })

      const areaRead = await payload.findByID({ collection: 'regions', id: area.id })
      expect(areaRead.defaultEventLanguage).toBe('de')
    })

    it('resolves inheritance across rows in one list read (shared-request memo)', async () => {
      const country = await payload.create({
        collection: 'regions',
        data: { name: 'Country 3', level: 'country', osmId: 'c3', defaultEventLanguage: 'en' },
      })
      const blankA = await payload.create({
        collection: 'regions',
        data: { name: 'Area 3a', level: 'area', osmId: 'a3a', parent: country.id },
      })
      const blankB = await payload.create({
        collection: 'regions',
        data: { name: 'Area 3b', level: 'area', osmId: 'a3b', parent: country.id },
      })
      const explicit = await payload.create({
        collection: 'regions',
        data: {
          name: 'Area 3c',
          level: 'area',
          osmId: 'a3c',
          parent: country.id,
          defaultEventLanguage: 'de',
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
      const languageById = new Map(docs.map((doc) => [doc.id, doc.defaultEventLanguage]))

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
        data: {
          eventType: 'offline',
          category: 'dropin',
          status: 'active',
          registrationMode: 'native',
          manager: managerId,
          address: { street: 'Hall A, Wing 2' },
        },
      })

      expect(event.title).toBe('Meditation at Hall A')
    })

    it('keeps an explicitly provided title', async () => {
      const event = await payload.create({
        collection: 'events',
        data: {
          title: 'Diwali Special',
          eventType: 'offline',
          category: 'festival',
          status: 'active',
          registrationMode: 'native',
          manager: managerId,
          address: { street: 'Hall A' },
        },
      })

      expect(event.title).toBe('Diwali Special')
    })

    it('leaves the title empty when there is no street to build from', async () => {
      const event = await payload.create({
        collection: 'events',
        data: {
          eventType: 'online',
          category: 'single',
          status: 'active',
          registrationMode: 'native',
          manager: managerId,
        },
      })

      expect(event.title ?? null).toBeNull()
    })
  })
})
