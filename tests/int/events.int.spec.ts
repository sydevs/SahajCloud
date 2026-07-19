import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
