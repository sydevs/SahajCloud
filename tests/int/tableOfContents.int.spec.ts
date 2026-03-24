import type { Payload } from 'payload'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { createLexicalWithTableOfContentsBlock } from '../utils/lexicalTestHelpers'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('TableOfContentsBlock', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('Block Schema', () => {
    it('stores block with null headings (default/uninitialized state)', async () => {
      const content = createLexicalWithTableOfContentsBlock({ headings: null })
      const page = await testData.createPage(payload, {
        title: 'ToC Null Headings',
        content,
      })

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
      expect(fields.blockType).toBe('table-of-contents')
      expect(fields.headings).toBeNull()
    })

    it('stores block with enabled headings array', async () => {
      const headings = [
        { slug: 'introduction', text: 'Introduction', level: 2 },
        { slug: 'getting-started', text: 'Getting Started', level: 2 },
      ]
      const content = createLexicalWithTableOfContentsBlock({ headings })
      const page = await testData.createPage(payload, {
        title: 'ToC With Headings',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const fields = root.children[0].fields as Record<string, unknown>

      expect(fields.blockType).toBe('table-of-contents')
      expect(Array.isArray(fields.headings)).toBe(true)
      const stored = fields.headings as Array<{ slug: string; text: string; level: number }>
      expect(stored).toHaveLength(2)
      expect(stored[0]).toEqual({ slug: 'introduction', text: 'Introduction', level: 2 })
      expect(stored[1]).toEqual({ slug: 'getting-started', text: 'Getting Started', level: 2 })
    })

    it('stores block with empty headings array (all explicitly disabled)', async () => {
      const content = createLexicalWithTableOfContentsBlock({ headings: [] })
      const page = await testData.createPage(payload, {
        title: 'ToC Empty Headings',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const fields = root.children[0].fields as Record<string, unknown>

      expect(fields.blockType).toBe('table-of-contents')
      expect(fields.headings).toEqual([])
    })

    it('stores optional title field', async () => {
      const content = createLexicalWithTableOfContentsBlock({
        title: 'In this article',
        headings: null,
      })
      const page = await testData.createPage(payload, {
        title: 'ToC With Title',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const fields = root.children[0].fields as Record<string, unknown>

      expect(fields.blockType).toBe('table-of-contents')
      expect(fields.title).toBe('In this article')
      expect(fields.headings).toBeNull()
    })

    it('stores block without title when title is omitted', async () => {
      const content = createLexicalWithTableOfContentsBlock({ headings: null })
      const page = await testData.createPage(payload, {
        title: 'ToC No Title',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const fields = root.children[0].fields as Record<string, unknown>

      expect(fields.blockType).toBe('table-of-contents')
      expect(fields.title).toBeUndefined()
    })

    it('preserves heading slug, text, and level fields', async () => {
      const headings = [
        { slug: 'overview', text: 'Overview', level: 1 },
        { slug: 'details', text: 'Details', level: 2 },
        { slug: 'deep-dive', text: 'Deep Dive', level: 3 },
      ]
      const content = createLexicalWithTableOfContentsBlock({ headings })
      const page = await testData.createPage(payload, {
        title: 'ToC Level Check',
        content,
      })

      const fetched = await payload.findByID({
        collection: 'pages',
        id: page.id,
        depth: 0,
      })

      const root = fetched.content?.root as { children: Array<Record<string, unknown>> }
      const fields = root.children[0].fields as Record<string, unknown>
      const stored = fields.headings as Array<{ slug: string; text: string; level: number }>

      expect(stored).toHaveLength(3)
      expect(stored[0].level).toBe(1)
      expect(stored[1].level).toBe(2)
      expect(stored[2].level).toBe(3)
      expect(stored[2].slug).toBe('deep-dive')
      expect(stored[2].text).toBe('Deep Dive')
    })
  })
})
