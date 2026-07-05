import type { Payload, PayloadRequest } from 'payload'

import { describe, it, beforeAll, afterAll, afterEach, expect, vi } from 'vitest'

import {
  createLexicalWithQuoteBlock,
  createLexicalWithRelationshipNode,
  createLexicalWithUploadNode,
} from '../utils/lexicalTestHelpers'
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

  describe('QuoteBlock Structure', () => {
    it('returns structured QuoteBlock with separate text, credit, and caption fields', async () => {
      const content = createLexicalWithQuoteBlock({
        text: 'The truth is to be experienced.',
        credit: 'Shri Mataji',
        caption: 'Founder of Sahaja Yoga meditation',
      })

      const page = await testData.createPage(payload, {
        title: 'Page with Quote',
        content,
      })

      // Fetch the page and verify the block structure
      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      expect(root.children).toHaveLength(1)

      const blockNode = root.children[0]
      expect(blockNode.type).toBe('block')

      const fields = blockNode.fields as Record<string, unknown>
      expect(fields.blockType).toBe('quote')
      expect(fields.text).toBe('The truth is to be experienced.')
      expect(fields.credit).toBe('Shri Mataji')
      expect(fields.caption).toBe('Founder of Sahaja Yoga meditation')
    })

    it('returns QuoteBlock with only text when credit and caption are omitted', async () => {
      const content = createLexicalWithQuoteBlock({
        text: 'A simple quote without attribution.',
      })

      const page = await testData.createPage(payload, {
        title: 'Page with Simple Quote',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const fields = root.children[0].fields as Record<string, unknown>
      expect(fields.blockType).toBe('quote')
      expect(fields.text).toBe('A simple quote without attribution.')
      expect(fields.credit).toBeUndefined()
      expect(fields.caption).toBeUndefined()
    })
  })

  describe('Lexical Upload Node', () => {
    it('saves an upload node without an explicit align value (defaults to "center")', async () => {
      const image = await testData.createMediaImage(payload, { alt: 'Inline upload' })
      const content = createLexicalWithUploadNode(image.id)

      const page = await testData.createPage(payload, {
        title: 'Page with Upload (no align)',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const uploadNode = root.children[0]
      expect(uploadNode.type).toBe('upload')
      expect(uploadNode.relationTo).toBe('images')

      const fields = uploadNode.fields as Record<string, unknown>
      expect(fields.align).toBe('center')
    })

    it('preserves an explicitly-set align value', async () => {
      const image = await testData.createMediaImage(payload, { alt: 'Inline upload' })
      const content = createLexicalWithUploadNode(image.id, {
        align: 'left',
        caption: 'A caption',
      })

      const page = await testData.createPage(payload, {
        title: 'Page with Upload (explicit align)',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const fields = root.children[0].fields as Record<string, unknown>
      expect(fields.align).toBe('left')
      expect(fields.caption).toBe('A caption')
    })
  })

  describe('content rich text', () => {
    it('strips stale relationship nodes for removed collections before rendering the editor', async () => {
      const staleContent = createLexicalWithRelationshipNode({
        relationTo: 'lecture-clips',
        value: 123,
      })

      const page = await testData.createPage(payload, {
        title: 'Page with stale content relationship',
        content: staleContent,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const contentRoot = fetched.content?.root as { children: unknown[] }
      expect(contentRoot.children).toEqual([])
    })
  })

  describe('Lexical Relationship Population Depth', () => {
    it('populates nested relationships on app-card referenced via lexical relationship node', async () => {
      // Create an image and app-card (with image reference) to embed via relationship
      const image = await testData.createMediaImage(payload, { alt: 'App card cover' })
      const appCard = await testData.createAppCard(payload, {
        default: { title: 'Embedded App Card', image: image.id },
      })

      // Build a page with a Lexical relationship node pointing at the app-card
      const content = {
        root: {
          type: 'root',
          children: [
            {
              type: 'relationship',
              version: 2,
              format: '',
              relationTo: 'app-cards',
              value: appCard.id,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          version: 1,
        },
      } as unknown as Parameters<typeof testData.createPage>[1]['content']

      const page = await testData.createPage(payload, {
        title: 'Page with App Card Relationship',
        content,
      })

      // Query with depth high enough to populate the app-card AND its image field
      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 2,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const relationshipNode = root.children[0]
      expect(relationshipNode.type).toBe('relationship')
      expect(relationshipNode.relationTo).toBe('app-cards')

      // The app-card document itself should be populated
      const populatedCard = relationshipNode.value as Record<string, unknown>
      expect(typeof populatedCard).toBe('object')
      expect(populatedCard.id).toBe(appCard.id)
      const populatedDefault = populatedCard.default as Record<string, unknown>
      expect(populatedDefault.title).toBe('Embedded App Card')

      // The app-card's own `default.image` relationship should ALSO be populated (not just an ID).
      // This verifies RelationshipFeature is not capping depth below the caller's request.
      const populatedImage = populatedDefault.image as Record<string, unknown> | number
      expect(typeof populatedImage).toBe('object')
      expect((populatedImage as Record<string, unknown>).id).toBe(image.id)
      expect((populatedImage as Record<string, unknown>).alt).toBe('App card cover')
    })

    it('populates app-card lexical relationships for wemeditate app clients', async () => {
      const admin = await testData.createManager(payload, {
        name: 'Admin for Page App Card Relationship Test',
        type: 'admin' as const,
      })
      const client = await testData.createClient(payload, admin.id, {
        name: 'Client for Page App Card Relationship Test',
        roles: ['wemeditate-app-client'],
        _status: 'published',
      })

      const image = await testData.createMediaImage(payload, { alt: 'Client app card cover' })
      const appCard = await testData.createAppCard(payload, {
        _status: 'published',
        default: { title: 'Client Embedded App Card', image: image.id },
      })

      const content = {
        root: {
          type: 'root',
          children: [
            {
              type: 'relationship',
              version: 2,
              format: '',
              relationTo: 'app-cards',
              value: appCard.id,
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          version: 1,
        },
      } as unknown as Parameters<typeof testData.createPage>[1]['content']

      const page = await testData.createPage(payload, {
        title: 'Published Page with Client App Card Relationship',
        _status: 'published',
        content,
      })
      const trustedClientReq = {
        payload,
        user: client,
        headers: new Headers(),
        context: { skipClientQueryValidation: true },
      } as unknown as PayloadRequest

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        select: { content: true },
        depth: 2,
        req: trustedClientReq,
        user: client,
        overrideAccess: false,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const relationshipNode = root.children[0]
      const populatedCard = relationshipNode.value as Record<string, unknown>
      const populatedDefault = populatedCard.default as Record<string, unknown>
      const populatedImage = populatedDefault.image as Record<string, unknown>

      expect(relationshipNode.type).toBe('relationship')
      expect(relationshipNode.relationTo).toBe('app-cards')
      expect(populatedCard.id).toBe(appCard.id)
      expect(populatedDefault.title).toBe('Client Embedded App Card')
      expect(populatedImage.id).toBe(image.id)

      const directRead = await payload.find({
        collection: 'app-cards',
        select: { id: true },
        depth: 0,
        user: client,
        overrideAccess: false,
      })
      expect(directRead.docs.map((doc) => doc.id)).toContain(appCard.id)
    })
  })

  describe('webUrl virtual field', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('English page with tag returns base/tag/slug', async () => {
      vi.stubEnv('WEMEDITATE_WEB_URL', 'https://wemeditate.com')
      const page = await testData.createPage(payload, {
        title: 'Shri Mataji Page',
        tags: ['wisdom'],
        _status: 'published',
      })
      const fetched = await payload.findByID({ collection: 'pages', id: page.id, locale: 'en' })
      expect(fetched.webUrl).toBe(`https://wemeditate.com/wisdom/${page.slug}`)
    })

    it('English page without tag returns base/slug', async () => {
      vi.stubEnv('WEMEDITATE_WEB_URL', 'https://wemeditate.com')
      const page = await testData.createPage(payload, {
        title: 'Untagged Page',
        _status: 'published',
      })
      const fetched = await payload.findByID({ collection: 'pages', id: page.id, locale: 'en' })
      expect(fetched.webUrl).toBe(`https://wemeditate.com/${page.slug}`)
    })

    it('Non-English page with tag returns base/locale/tag/slug', async () => {
      vi.stubEnv('WEMEDITATE_WEB_URL', 'https://wemeditate.com')
      const page = await testData.createPage(payload, {
        title: 'Czech Tagged Page',
        tags: ['wisdom'],
        _status: 'published',
      })
      const fetched = await payload.findByID({ collection: 'pages', id: page.id, locale: 'cs' })
      expect(fetched.webUrl).toBe(`https://wemeditate.com/cs/wisdom/${page.slug}`)
    })

    it('Non-English page without tag returns base/locale/slug', async () => {
      vi.stubEnv('WEMEDITATE_WEB_URL', 'https://wemeditate.com')
      const page = await testData.createPage(payload, {
        title: 'Czech Untagged Page',
        _status: 'published',
      })
      const fetched = await payload.findByID({ collection: 'pages', id: page.id, locale: 'cs' })
      expect(fetched.webUrl).toBe(`https://wemeditate.com/cs/${page.slug}`)
    })

    it('returns null when WEMEDITATE_WEB_URL is not set', async () => {
      vi.stubEnv('WEMEDITATE_WEB_URL', '')
      const page = await testData.createPage(payload, { title: 'No Env Page' })
      const fetched = await payload.findByID({ collection: 'pages', id: page.id })
      expect(fetched.webUrl).toBeNull()
    })

    it('stops exposing the URL once a published page is unpublished', async () => {
      vi.stubEnv('WEMEDITATE_WEB_URL', 'https://wemeditate.com')
      const page = await testData.createPage(payload, {
        title: 'Unpublish Page',
        _status: 'published',
      })
      const published = await payload.findByID({ collection: 'pages', id: page.id })
      expect(published.webUrl).toBe(`https://wemeditate.com/${page.slug}`)

      await payload.update({ collection: 'pages', id: page.id, data: { _status: 'draft' } })
      const draft = await payload.findByID({ collection: 'pages', id: page.id, draft: true })
      expect(draft.webUrl).toBeNull()
    })
  })

  // #542: a bulk publish fans the appUrl afterRead across every doc; guard that
  // it publishes each and leaves version history intact. The once-per-request
  // wm-app-config load is guarded deterministically in
  // tests/unit/pages-app-config-cache.spec.ts — the stampede reproduces only
  // under production's connection-pool wait, not against a fast local DB, so a
  // black-box count here would pass on the buggy code too.
  describe('bulk publish (#542)', () => {
    it('publishes each doc and leaves one published latest version per doc', async () => {
      const drafts = await Promise.all(
        Array.from({ length: 3 }, () => testData.createPage(payload)),
      )
      const ids = drafts.map((p) => p.id)

      const result = await payload.update({
        collection: 'pages',
        where: { id: { in: ids } },
        data: { _status: 'published' },
      })

      expect(result.docs).toHaveLength(ids.length)
      result.docs.forEach((doc) => expect(doc._status).toBe('published'))

      for (const id of ids) {
        const versions = await payload.findVersions({
          collection: 'pages',
          where: { parent: { equals: id } },
          limit: 100,
        })
        const latest = versions.docs.filter((v) => v.latest)
        expect(latest).toHaveLength(1)
        expect(latest[0]?.version._status).toBe('published')
      }
    })
  })
})
