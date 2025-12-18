import type { Locale, PayloadRequest } from 'payload'

import { describe, it, expect } from 'vitest'

import { filterAvailableLocales } from '../../src/lib/access'
import { buildPayloadLocales } from '../../src/lib/locales'
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
  describe('locale configuration', () => {
    it('builds all 16 locales with proper configuration', () => {
      expect(allLocales).toHaveLength(16)
      expect(allLocales.map((l) => l.code)).toEqual([
        'en',
        'es',
        'de',
        'it',
        'fr',
        'ru',
        'ro',
        'cs',
        'uk',
        'el',
        'hy',
        'pl',
        'pt-br',
        'fa',
        'bg',
        'tr',
      ])
    })

    it('sets RTL for Farsi locale', () => {
      const farsiLocale = allLocales.find((l) => l.code === 'fa')
      expect(farsiLocale?.rtl).toBe(true)
    })

    it('sets fallbackLocale to English for non-English locales', () => {
      const nonEnglishLocales = allLocales.filter((l) => l.code !== 'en')
      nonEnglishLocales.forEach((locale) => {
        expect(locale.fallbackLocale).toBe('en')
      })
    })

    it('does not set fallbackLocale for English', () => {
      const englishLocale = allLocales.find((l) => l.code === 'en')
      expect(englishLocale?.fallbackLocale).toBeUndefined()
    })

    it('has proper labels from ISO 639-1 or overrides', () => {
      const englishLocale = allLocales.find((l) => l.code === 'en')
      expect(englishLocale?.label).toBe('English')

      const germanLocale = allLocales.find((l) => l.code === 'de')
      expect(germanLocale?.label).toBe('German')

      // Check override for Brazilian Portuguese
      const ptBrLocale = allLocales.find((l) => l.code === 'pt-br')
      expect(ptBrLocale?.label).toBe('Brazilian Portuguese')

      // Check override for Farsi
      const farsiLocale = allLocales.find((l) => l.code === 'fa')
      expect(farsiLocale?.label).toBe('Farsi/Persian')
    })
  })

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

      expect(result).toHaveLength(16)
      expect(result).toEqual(allLocales)
    })
  })

  describe('API clients', () => {
    it('returns all locales for API clients (not filtered)', () => {
      const clientUser = testData.dummyUser('clients', {
        id: 1,
        roles: ['wemeditate-web'],
      })
      const req = createMockRequest(clientUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(16)
      expect(result).toEqual(allLocales)
    })
  })

  describe('inactive managers', () => {
    it('returns only English for inactive managers', () => {
      const inactiveUser = testData.dummyUser('managers', {
        id: 1,
        type: 'inactive',
        roles: { en: ['translator'], cs: ['meditations-editor'] },
      })
      const req = createMockRequest(inactiveUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })
  })

  describe('regular managers', () => {
    it('returns English + locales with roles for regular managers', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: { cs: ['meditations-editor'], de: ['translator'] },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // Should include English (always) + Czech + German
      expect(result).toHaveLength(3)
      expect(result.map((l) => l.code).sort()).toEqual(['cs', 'de', 'en'])
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
          en: ['translator'],
          cs: ['meditations-editor'],
          de: ['path-editor'],
          fa: ['translator'],
        },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // Should include English + Czech + German + Farsi
      expect(result).toHaveLength(4)
      expect(result.map((l) => l.code).sort()).toEqual(['cs', 'de', 'en', 'fa'])
    })

    it('returns only English when roles is undefined', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
      })
      // Explicitly set roles to undefined to simulate missing field
      ;(managerUser as Record<string, unknown>).roles = undefined

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
      ;(managerUser as Record<string, unknown>).roles = ['translator', 'meditations-editor']

      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // Flat array format is treated as invalid for locale filtering
      expect(result).toHaveLength(1)
      expect(result[0].code).toBe('en')
    })
  })

  describe('locale filtering preserves order', () => {
    it('maintains the original locale order in results', () => {
      const managerUser = testData.dummyUser('managers', {
        id: 1,
        type: 'manager',
        roles: { fa: ['translator'], de: ['meditations-editor'], en: ['path-editor'] },
      })
      const req = createMockRequest(managerUser)
      const result = filterAvailableLocales({ locales: allLocales, req })

      // Order should match original allLocales order
      const resultCodes = result.map((l) => l.code)
      expect(resultCodes).toEqual(['en', 'de', 'fa']) // Original order: en, es, de, ..., fa, ...
    })
  })
})
