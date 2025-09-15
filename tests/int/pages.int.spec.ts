import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import type { Page, Media } from '@/payload-types'
import type { Payload } from 'payload'
import { createTestEnvironment } from '../utils/testHelpers'
import { testData } from '../utils/testData'

describe('Pages Collection', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testThumbnail: Media
  let testShowcaseMedia1: Media
  let testShowcaseMedia2: Media

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup

    // Create test media for thumbnail and showcase
    testThumbnail = await testData.createMediaImage(payload, { alt: 'Page thumbnail' })
    testShowcaseMedia1 = await testData.createMediaImage(payload, { alt: 'Showcase media 1' })
    testShowcaseMedia2 = await testData.createMediaImage(payload, { alt: 'Showcase media 2' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Basic Page Operations', () => {
    it('creates a page with auto-generated slug', async () => {
      const page = await testData.createPage(payload, {
        title: 'My First Page',
        thumbnail: testThumbnail.id,
        category: 'technique',
        tags: ['living', 'creativity'],
      })

      expect(page).toBeDefined()
      expect(page.title).toBe('My First Page')
      expect(page.slug).toBe('my-first-page')
      expect(page.category).toBe('technique')
      expect(page.tags).toEqual(['living', 'creativity'])
    })

    it('handles special characters in slug generation', async () => {
      const page = await testData.createPage(payload, {
        title: 'Page: Testing & Validation!',
        category: 'event',
      })

      expect(page.slug).toBe('page-testing-and-validation')
    })

    it('enforces slug uniqueness', async () => {
      const page1 = await testData.createPage(payload, {
        title: 'Unique Page',
      })
      
      expect(page1.slug).toBe('unique-page')

      await expect(
        payload.create({
          collection: 'pages',
          data: {
            title: 'Different Title',
            slug: 'unique-page', // Try to use the same slug
            thumbnail: testThumbnail.id,
            category: 'knowledge',
          },
        })
      ).rejects.toThrow()
    })
  })

  describe('Block System', () => {
    it('creates page with ContentBlock', async () => {
      const page = await testData.createPage(payload, {
        title: 'Page with Content Block',
        content: [
          {
            blockType: 'content',
            title: 'Welcome Section',
            text: '<p>This is a content block with some text.</p>',
            link: 'https://example.com',
            actionText: 'Learn More',
          },
        ],
      })

      expect(page.content).toHaveLength(1)
      const block = page.content![0]
      expect(block.blockType).toBe('content')
      expect(block).toHaveProperty('title', 'Welcome Section')
      expect(block).toHaveProperty('text', '<p>This is a content block with some text.</p>')
      expect(block).toHaveProperty('link', 'https://example.com')
      expect(block).toHaveProperty('actionText', 'Learn More')
    })

    it('validates ContentBlock text character limit (250 chars)', async () => {
      const longText = '<p>' + 'a'.repeat(260) + '</p>' // Create text longer than 250 chars

      await expect(
        testData.createPage(payload, {
          title: 'Page with Long Content',
          content: [
            {
              blockType: 'content',
              text: longText,
            },
          ],
        })
      ).rejects.toThrow()
    })

    it('creates page with ImageBlock', async () => {
      const page = await testData.createPage(payload, {
        title: 'Page with Image Block',
        content: [
          {
            blockType: 'image',
            image: testShowcaseMedia1.id,
            caption: 'A beautiful landscape',
            display: 'full',
          },
        ],
      })

      expect(page.content).toHaveLength(1)
      const block = page.content![0]
      expect(block.blockType).toBe('image')
      // Image will be populated as an object, so check if it's the right media
      expect(typeof block.image).toBe('object')
      expect((block.image as any).id).toBe(testShowcaseMedia1.id)
      expect(block).toHaveProperty('caption', 'A beautiful landscape')
      expect(block).toHaveProperty('display', 'full')
    })

    it('creates page with TextBlock', async () => {
      const page = await testData.createPage(payload, {
        title: 'Page with Text Block',
        content: [
          {
            blockType: 'text',
            title: 'Introduction',
            text: {
              root: {
                type: 'root',
                children: [
                  {
                    type: 'paragraph',
                    version: 1,
                    children: [
                      {
                        type: 'text',
                        version: 1,
                        text: 'This is a longer text block with rich text formatting.',
                      },
                    ],
                  },
                ],
                direction: null,
              },
            },
          },
        ],
      })

      expect(page.content).toHaveLength(1)
      const block = page.content![0]
      expect(block.blockType).toBe('text')
      expect(block).toHaveProperty('title', 'Introduction')
      expect(block.text).toBeDefined()
    })

    it('creates page with LayoutBlock', async () => {
      const page = await testData.createPage(payload, {
        title: 'Page with Layout Block',
        content: [
          {
            blockType: 'layout',
            style: 'grid',
            items: [
              {
                title: 'Item 1',
                text: '<p>First item text</p>',
                image: testShowcaseMedia1.id,
              },
              {
                title: 'Item 2',
                text: '<p>Second item text</p>',
                link: 'https://example.com',
              },
            ],
          },
        ],
      })

      expect(page.content).toHaveLength(1)
      const block = page.content![0]
      expect(block.blockType).toBe('layout')
      expect(block).toHaveProperty('style', 'grid')
      expect(block).toHaveProperty('items')
      expect(block.items).toHaveLength(2)
    })

    it('creates page with ShowcaseBlock for media collection', async () => {
      const page = await testData.createPage(payload, {
        title: 'Page with Media Showcase',
        content: [
          {
            blockType: 'showcase',
            title: 'Featured Images',
            collectionType: 'media',
            items: [
              { relationTo: 'media', value: testShowcaseMedia1.id },
              { relationTo: 'media', value: testShowcaseMedia2.id },
            ],
          },
        ],
      })

      expect(page.content).toHaveLength(1)
      const block = page.content![0]
      expect(block.blockType).toBe('showcase')
      expect(block).toHaveProperty('title', 'Featured Images')
      expect(block).toHaveProperty('collectionType', 'media')
      expect(block).toHaveProperty('items')
      expect(block.items).toHaveLength(2)
    })

    it('validates ShowcaseBlock max items limit (10)', async () => {
      // Create 11 media items
      const mediaItems = await Promise.all(
        Array.from({ length: 11 }, (_, i) =>
          testData.createMediaImage(payload, { alt: `Media ${i + 1}` })
        )
      )

      await expect(
        testData.createPage(payload, {
          title: 'Page with Too Many Showcase Items',
          content: [
            {
              blockType: 'showcase',
              collectionType: 'media',
              items: mediaItems.map((media) => ({ relationTo: 'media', value: media.id })),
            },
          ],
        })
      ).rejects.toThrow()
    })

  })

  describe('Categories and Tags', () => {
    it('validates required category field', async () => {
      await expect(
        payload.create({
          collection: 'pages',
          data: {
            title: 'Page without Category',
            thumbnail: testThumbnail.id,
            // category is missing
            content: [],
          },
        })
      ).rejects.toThrow()
    })

    it('allows multiple tags selection', async () => {
      const page = await testData.createPage(payload, {
        title: 'Multi-tagged Page',
        tags: ['living', 'creativity', 'wisdom', 'stories'],
      })

      expect(page.tags).toHaveLength(4)
      expect(page.tags).toContain('living')
      expect(page.tags).toContain('creativity')
      expect(page.tags).toContain('wisdom')
      expect(page.tags).toContain('stories')
    })
  })

  describe('Publish Functionality', () => {
    it('creates page with publishAt date', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7) // 7 days in the future

      const page = await testData.createPage(payload, {
        title: 'Scheduled Page',
        publishAt: futureDate.toISOString(),
      })

      expect(page.publishAt).toBeDefined()
      const publishDate = new Date(page.publishAt!)
      expect(publishDate.getTime()).toBeGreaterThanOrEqual(Date.now())
    })
  })
})