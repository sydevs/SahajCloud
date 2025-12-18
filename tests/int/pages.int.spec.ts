import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { PageTag } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Pages Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let livingTag: PageTag
  let creativityTag: PageTag
  let wisdomTag: PageTag
  let storiesTag: PageTag

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create page tags for testing (slug auto-generated from title)
    livingTag = await testData.createPageTag(payload, { title: 'Living' })
    creativityTag = await testData.createPageTag(payload, { title: 'Creativity' })
    wisdomTag = await testData.createPageTag(payload, { title: 'Wisdom' })
    storiesTag = await testData.createPageTag(payload, { title: 'Stories' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Basic Page Operations', () => {
    it('creates a page with auto-generated slug', async () => {
      const page = await testData.createPage(payload, {
        title: 'My First Page',
        tags: [livingTag.id, creativityTag.id],
      })

      expect(page).toBeDefined()
      expect(page.title).toBe('My First Page')
      expect(page.slug).toBe('my-first-page')
      expect(page.tags).toHaveLength(2)
      const tagIds = page.tags?.map((tag) => (typeof tag === 'object' && tag ? tag.id : tag)) || []
      expect(tagIds).toContain(livingTag.id)
      expect(tagIds).toContain(creativityTag.id)
    })

  })

  describe('Categories and Tags', () => {
    it('allows multiple tags selection', async () => {
      const page = await testData.createPage(payload, {
        title: 'Multi-tagged Page',
        tags: [livingTag.id, creativityTag.id, wisdomTag.id, storiesTag.id],
      })

      expect(page.tags).toHaveLength(4)
      const tagIds = page.tags?.map((tag) => (typeof tag === 'object' && tag ? tag.id : tag)) || []
      expect(tagIds).toContain(livingTag.id)
      expect(tagIds).toContain(creativityTag.id)
      expect(tagIds).toContain(wisdomTag.id)
      expect(tagIds).toContain(storiesTag.id)
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
