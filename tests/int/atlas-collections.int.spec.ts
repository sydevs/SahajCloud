import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Custom-logic coverage for the Phase 2 Atlas collections:
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
