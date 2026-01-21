import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Pages Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  // Page tags are now inline enum strings
  const wisdomTag = 'wisdom'
  const lifestyleTag = 'lifestyle'
  const creativityTag = 'creativity'
  const eventTag = 'event'

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Basic Page Operations', () => {
    it('creates a page with auto-generated slug', async () => {
      const page = await testData.createPage(payload, {
        title: 'My First Page',
        tags: [wisdomTag, creativityTag],
      })

      expect(page).toBeDefined()
      expect(page.title).toBe('My First Page')
      expect(page.slug).toBe('my-first-page')
      expect(page.tags).toHaveLength(2)
      expect(page.tags).toContain(wisdomTag)
      expect(page.tags).toContain(creativityTag)
    })
  })

  describe('Categories and Tags', () => {
    it('allows multiple tags selection', async () => {
      const page = await testData.createPage(payload, {
        title: 'Multi-tagged Page',
        tags: [wisdomTag, lifestyleTag, creativityTag, eventTag],
      })

      expect(page.tags).toHaveLength(4)
      expect(page.tags).toContain(wisdomTag)
      expect(page.tags).toContain(lifestyleTag)
      expect(page.tags).toContain(creativityTag)
      expect(page.tags).toContain(eventTag)
    })
  })

  describe('Publish Functionality', () => {
    it('creates page as draft by default', async () => {
      const page = await testData.createPage(payload, {
        title: 'Draft Page',
      })

      expect(page._status).toBe('draft')
    })

    it('creates page as published', async () => {
      const page = await testData.createPage(payload, {
        title: 'Published Page',
        _status: 'published',
      })

      expect(page._status).toBe('published')
    })

    it('can transition from draft to published', async () => {
      const page = await testData.createPage(payload, {
        title: 'Transition Page',
        _status: 'draft',
      })
      expect(page._status).toBe('draft')

      const published = await payload.update({
        collection: 'pages',
        id: page.id,
        data: { _status: 'published' },
      })
      expect(published._status).toBe('published')
    })
  })
})
