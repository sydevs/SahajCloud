/**
 * filterAvailableLocales Tests
 *
 * Tests the admin UI locale filtering based on user permissions.
 * Locale configuration tests are in locales.int.spec.ts
 */

import type { PayloadRequest } from 'payload'

import { describe, it, expect } from 'vitest'

import { buildPayloadLocales } from '../../src/lib/locales'
import { filterAvailableLocales } from '../../src/plugins/access'
import { testData } from '../utils/testData'

// Build locales once for all tests
const allLocales = buildPayloadLocales()

/**
 * Helper to create a mock PayloadRequest with user
 */
function createMockRequest(user: unknown): PayloadRequest {
  return {
    user,
  } as unknown as PayloadRequest
}

describe('filterAvailableLocales', () => {
  describe('unauthenticated requests', () => {
    it('returns only English for unauthenticated requests', () => {
      const req = createMockRequest(null)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })

    it('returns only English for undefined user', () => {
      const req = createMockRequest(undefined)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })
  })

  describe('admin managers', () => {
    it('returns all locales for admin users', () => {
      const adminUser = testData.dummyUser('managers', {
        id: 1,
        type: 'admin',
      })
      const req = createMockRequest(adminUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(19)
      expect(result).toEqual(allLocales)
    })
  })

  describe('API clients', () => {
    it('returns all locales for API clients (not filtered)', () => {
      const clientUser = testData.dummyUser('clients', {
        id: 1,
        roles: ['wemeditate-web-client'],
      })
      const req = createMockRequest(clientUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(19)
      expect(result).toEqual(allLocales)
    })
  })

  describe('inactive managers', () => {
    it('returns only English for inactive managers', () => {
      const inactiveUser = testData.dummyUser('managers', {
        id: 1,
        type: 'inactive',
        roles: { en: ['web-translator'], cs: ['meditations-editor'] },
      })
      const req = createMockRequest(inactiveUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })
  })

  describe('regular managers', () => {
    it('returns exactly the locales with roles, and does not add English', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: { cs: ['meditations-editor'], de: ['web-translator'] },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // Czech and German only. English is no longer force-added (#665): it made
      // the dropdown claim access the manager does not have, and pinned them to
      // a locale their roles need not cover.
      expect(result.map((l) => l.code)).toEqual(['de', 'cs'])
    })

    it('offers only their own locale to a manager with no English roles', () => {
      // The manager in #665's report: roles assigned in French alone. They used
      // to get an English-only dropdown, which made French unreachable.
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: { fr: ['web-translator'] },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result.map((l) => l.code)).toEqual(['fr'])
    })

    it('orders locales by role count, most first', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: { en: ['path-editor'], fr: ['web-translator', 'meditations-editor'] },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // French first: it carries two roles to English's one. The first entry is
      // also where Payload lands the manager, so this ordering is the landing
      // locale as well as the display order.
      expect(result.map((l) => l.code)).toEqual(['fr', 'en'])
    })

    it('returns only English for managers with no roles', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: {},
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })

    it('returns only English for managers with empty role arrays', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: { en: [], cs: [], de: [] },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })

    it('handles managers with roles in multiple locales', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: {
          en: ['web-translator'],
          cs: ['meditations-editor'],
          de: ['path-editor'],
          fa: ['web-translator'],
        },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // All four carry one role, so the count cannot separate them and the
      // tie-break falls to LOCALES order: en, de, cs, fa.
      expect(result.map((l) => l.code)).toEqual(['en', 'de', 'cs', 'fa'])
    })

    it('returns only English when roles is undefined', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
      })
      // Explicitly set roles to undefined to simulate missing field
      ;(managerUser as unknown as Record<string, unknown>).roles = undefined

      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })

    it('returns only English when roles is a flat array (legacy format)', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
      })
      // Set roles to flat array to simulate legacy format
      ;(managerUser as unknown as Record<string, unknown>).roles = [
        'web-translator',
        'meditations-editor',
      ]

      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // Flat array format is treated as invalid for locale filtering
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })
  })

  describe('ordering', () => {
    it('breaks an equal role count on LOCALES order, not insertion order', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        // Deliberately supplied fa-first: the result must not follow this.
        roles: { fa: ['web-translator'], de: ['meditations-editor'], en: ['path-editor'] },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result.map((l) => l.code)).toEqual(['en', 'de', 'fa'])
    })

    it('puts role count ahead of LOCALES order', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        // `fa` sits last in LOCALES but carries the most roles, so it leads.
        roles: {
          en: ['path-editor'],
          fa: ['web-translator', 'meditations-editor', 'path-editor'],
        },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result.map((l) => l.code)).toEqual(['fa', 'en'])
    })

    it('never returns an empty array', () => {
      // An empty `localeCodes` makes `views/Root` redirect to `undefined`, which
      // `qs.stringify` drops — so the route redirects to itself, forever. Every
      // shape that yields no role locale must still produce one entry.
      for (const roles of [{}, { en: [] }, undefined, ['web-translator']]) {
        const managerUser = testData.dummyUser('managers', { id: 1, type: 'manager' })
        ;(managerUser as unknown as Record<string, unknown>).roles = roles

        const result = filterAvailableLocales({
          locales: allLocales,
          req: createMockRequest(managerUser),
        })

        expect(result.length).toBeGreaterThan(0)
        expect(result[0].code).toBe('en')
      }
    })
  })
})
