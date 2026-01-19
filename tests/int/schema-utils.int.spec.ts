import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  discoverReferencesForCollection,
  extractId,
  extractIdsFromDocument,
  extractIdsFromLexicalContent,
  groupByCollection,
  type FieldReference,
} from '@/lib/schemaUtils'

import {
  createLexicalWithGalleryBlock,
  createLexicalWithLayoutBlock,
  createLexicalWithTextBoxBlock,
} from '../utils/lexicalTestHelpers'
import { createTestEnvironment } from '../utils/testHelpers'

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Schema Introspection Utilities', () => {
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

  // ==========================================================================
  // discoverReferencesForCollection
  // ==========================================================================

  describe('discoverReferencesForCollection', () => {
    it('discovers simple upload fields referencing files', () => {
      const refs = discoverReferencesForCollection(payload, 'files')

      // lessons.introAudio is a simple upload field to files
      const introAudioRef = refs.find(
        (r) => r.collection === 'lessons' && r.fieldPath === 'introAudio',
      )
      expect(introAudioRef).toBeDefined()
      expect(introAudioRef?.fieldType).toBe('upload')
      expect(introAudioRef?.hasMany).toBe(false)
      expect(introAudioRef?.relationTo).toBe('files')
      expect(introAudioRef?.isLexicalBlock).toBe(false)
    })

    it('discovers array-nested upload fields', () => {
      const refs = discoverReferencesForCollection(payload, 'files')

      // lessons.panels[].media is an upload field inside an array
      const panelsMediaRef = refs.find(
        (r) => r.collection === 'lessons' && r.fieldPath === 'panels.*.media',
      )
      expect(panelsMediaRef).toBeDefined()
      expect(panelsMediaRef?.fieldType).toBe('upload')
      expect(panelsMediaRef?.hasMany).toBe(false)
      expect(panelsMediaRef?.relationTo).toBe('files')
    })

    it('discovers upload fields referencing images', () => {
      const refs = discoverReferencesForCollection(payload, 'images')

      // authors.photo is an upload field to images
      const photoRef = refs.find(
        (r) => r.collection === 'authors' && r.fieldPath === 'photo',
      )
      expect(photoRef).toBeDefined()
      expect(photoRef?.fieldType).toBe('upload')
      expect(photoRef?.relationTo).toBe('images')

      // lectures.thumbnail
      const lectureThumbRef = refs.find(
        (r) => r.collection === 'lectures' && r.fieldPath === 'thumbnail',
      )
      expect(lectureThumbRef).toBeDefined()

      // meditations.thumbnail
      const meditationThumbRef = refs.find(
        (r) => r.collection === 'meditations' && r.fieldPath === 'thumbnail',
      )
      expect(meditationThumbRef).toBeDefined()

      // lessons.icon
      const iconRef = refs.find(
        (r) => r.collection === 'lessons' && r.fieldPath === 'icon',
      )
      expect(iconRef).toBeDefined()
    })

    it('discovers Lexical richText fields that may contain image references', () => {
      const refs = discoverReferencesForCollection(payload, 'images')

      // Filter to only Lexical marker references from pages.content
      // The new approach creates a single marker reference for richText fields
      // that indicates the field contains Lexical content needing generic traversal
      const lexicalRefs = refs.filter(
        (r) => r.collection === 'pages' && r.isLexicalBlock,
      )

      expect(lexicalRefs.length).toBeGreaterThan(0)

      // Should have a marker reference for the content field
      const contentRef = lexicalRefs.find((r) => r.fieldPath === 'content')
      expect(contentRef).toBeDefined()
      expect(contentRef?.isLexicalBlock).toBe(true)
      // The marker reference doesn't have a specific blockSlug (generic traversal)
      expect(contentRef?.blockSlug).toBeUndefined()
    })

    it('does not include fields referencing other collections', () => {
      const fileRefs = discoverReferencesForCollection(payload, 'files')

      // meditations.narrator references narrators, not files
      const narratorRef = fileRefs.find(
        (r) => r.collection === 'meditations' && r.fieldPath === 'narrator',
      )
      expect(narratorRef).toBeUndefined()

      // pages.author references authors, not files
      const authorRef = fileRefs.find(
        (r) => r.collection === 'pages' && r.fieldPath === 'author',
      )
      expect(authorRef).toBeUndefined()
    })

    it('skips payload internal collections', () => {
      const refs = discoverReferencesForCollection(payload, 'files')

      // Should not include payload-migrations, payload-preferences, etc.
      const payloadRefs = refs.filter((r) => r.collection.startsWith('payload-'))
      expect(payloadRefs).toHaveLength(0)
    })
  })

  // ==========================================================================
  // extractId
  // ==========================================================================

  describe('extractId', () => {
    it('extracts ID from number', () => {
      expect(extractId(123)).toBe(123)
    })

    it('extracts ID from string', () => {
      expect(extractId('456')).toBe(456)
    })

    it('extracts ID from populated object', () => {
      expect(extractId({ id: 789, filename: 'test.jpg' })).toBe(789)
      expect(extractId({ id: '101', filename: 'test.jpg' })).toBe(101)
    })

    it('returns null for invalid values', () => {
      expect(extractId(null)).toBeNull()
      expect(extractId(undefined)).toBeNull()
      expect(extractId('not-a-number')).toBeNull()
      expect(extractId({})).toBeNull()
      // Strings that start with numbers but aren't fully numeric should return null
      expect(extractId('123abc')).toBeNull()
      expect(extractId('1748234234_abcdef')).toBeNull()
    })
  })

  // ==========================================================================
  // extractIdsFromDocument
  // ==========================================================================

  describe('extractIdsFromDocument', () => {
    it('extracts ID from simple field path', () => {
      const doc = { introAudio: 123 }
      const ref: FieldReference = {
        collection: 'lessons',
        fieldPath: 'introAudio',
        fieldType: 'upload',
        hasMany: false,
        relationTo: 'files',
        isLexicalBlock: false,
      }

      const ids = extractIdsFromDocument(doc, ref)
      expect(ids.has(123)).toBe(true)
    })

    it('extracts IDs from array path with wildcard', () => {
      const doc = {
        panels: [
          { media: 1 },
          { media: 2 },
          { title: 'No media' },
          { media: 3 },
        ],
      }
      const ref: FieldReference = {
        collection: 'lessons',
        fieldPath: 'panels.*.media',
        fieldType: 'upload',
        hasMany: false,
        relationTo: 'files',
        isLexicalBlock: false,
      }

      const ids = extractIdsFromDocument(doc, ref)
      expect(ids.has(1)).toBe(true)
      expect(ids.has(2)).toBe(true)
      expect(ids.has(3)).toBe(true)
      expect(ids.size).toBe(3)
    })

    it('extracts IDs from hasMany field', () => {
      const doc = { items: [10, 20, 30] }
      const ref: FieldReference = {
        collection: 'gallery',
        fieldPath: 'items',
        fieldType: 'upload',
        hasMany: true,
        relationTo: 'images',
        isLexicalBlock: false,
      }

      const ids = extractIdsFromDocument(doc, ref)
      expect(ids.has(10)).toBe(true)
      expect(ids.has(20)).toBe(true)
      expect(ids.has(30)).toBe(true)
    })

    it('handles populated relationships', () => {
      const doc = {
        photo: { id: 42, filename: 'avatar.jpg', url: '/media/avatar.jpg' },
      }
      const ref: FieldReference = {
        collection: 'authors',
        fieldPath: 'photo',
        fieldType: 'upload',
        hasMany: false,
        relationTo: 'images',
        isLexicalBlock: false,
      }

      const ids = extractIdsFromDocument(doc, ref)
      expect(ids.has(42)).toBe(true)
    })

    it('skips Lexical block fields', () => {
      const doc = { content: { root: { children: [] } } }
      const ref: FieldReference = {
        collection: 'pages',
        fieldPath: 'content',
        fieldType: 'upload',
        hasMany: true,
        relationTo: 'images',
        isLexicalBlock: true,
        // No blockSlug - the new approach uses a single marker reference for richText fields
      }

      // Lexical block fields should be skipped (handled separately by extractIdsFromLexicalContent)
      const ids = extractIdsFromDocument(doc, ref)
      expect(ids.size).toBe(0)
    })
  })

  // ==========================================================================
  // extractIdsFromLexicalContent
  // ==========================================================================

  describe('extractIdsFromLexicalContent', () => {
    it('extracts image ID from TextBoxBlock using generic traversal', () => {
      const content = createLexicalWithTextBoxBlock(100)

      // The new approach uses generic traversal - no blockRefs needed
      const ids = extractIdsFromLexicalContent(content)
      expect(ids.has(100)).toBe(true)
    })

    it('extracts image IDs from LayoutBlock items using generic traversal', () => {
      const content = createLexicalWithLayoutBlock([201, 202, 203])

      // Generic traversal finds all ID-like values in block fields
      const ids = extractIdsFromLexicalContent(content)
      expect(ids.has(201)).toBe(true)
      expect(ids.has(202)).toBe(true)
      expect(ids.has(203)).toBe(true)
    })

    it('extracts image IDs from GalleryBlock using generic traversal', () => {
      const content = createLexicalWithGalleryBlock([301, 302, 303])

      // Generic traversal handles arrays of IDs
      const ids = extractIdsFromLexicalContent(content)
      expect(ids.has(301)).toBe(true)
      expect(ids.has(302)).toBe(true)
      expect(ids.has(303)).toBe(true)
    })

    it('handles empty content gracefully', () => {
      const ids = extractIdsFromLexicalContent(null)
      expect(ids.size).toBe(0)

      const ids2 = extractIdsFromLexicalContent({})
      expect(ids2.size).toBe(0)
    })
  })

  // ==========================================================================
  // groupByCollection
  // ==========================================================================

  describe('groupByCollection', () => {
    it('groups references by source collection', () => {
      const refs: FieldReference[] = [
        {
          collection: 'lessons',
          fieldPath: 'introAudio',
          fieldType: 'upload',
          hasMany: false,
          relationTo: 'files',
          isLexicalBlock: false,
        },
        {
          collection: 'lessons',
          fieldPath: 'panels.*.media',
          fieldType: 'upload',
          hasMany: false,
          relationTo: 'files',
          isLexicalBlock: false,
        },
        {
          collection: 'authors',
          fieldPath: 'photo',
          fieldType: 'upload',
          hasMany: false,
          relationTo: 'images',
          isLexicalBlock: false,
        },
      ]

      const groups = groupByCollection(refs)

      expect(groups.get('lessons')?.length).toBe(2)
      expect(groups.get('authors')?.length).toBe(1)
    })
  })

  // ==========================================================================
  // Auto-Detection Test
  // ==========================================================================

  describe('Auto-Detection', () => {
    it('automatically discovers all known file references without hardcoding', () => {
      // This test verifies that the schema introspection finds all known references
      // If a new collection with file references is added, this test should still pass
      // (unless we add specific assertions for new collections)

      const fileRefs = discoverReferencesForCollection(payload, 'files')

      // Get collection names that reference files
      const collectionsWithFiles = new Set(fileRefs.map((r) => r.collection))

      // lessons should be discovered (introAudio, panels[].media)
      expect(collectionsWithFiles.has('lessons')).toBe(true)

      // Verify the expected number of file references from lessons
      const lessonFileRefs = fileRefs.filter((r) => r.collection === 'lessons')
      expect(lessonFileRefs.length).toBeGreaterThanOrEqual(2)
    })

    it('automatically discovers all known image references without hardcoding', () => {
      const imageRefs = discoverReferencesForCollection(payload, 'images')

      // Get collection names that reference images
      const collectionsWithImages = new Set(imageRefs.map((r) => r.collection))

      // These collections should be discovered automatically
      expect(collectionsWithImages.has('authors')).toBe(true)
      expect(collectionsWithImages.has('lectures')).toBe(true)
      expect(collectionsWithImages.has('meditations')).toBe(true)
      expect(collectionsWithImages.has('lessons')).toBe(true)
      expect(collectionsWithImages.has('pages')).toBe(true) // Lexical blocks

      // Verify we found at least the expected number of image references
      // (This number may grow as new collections are added, which is fine)
      expect(imageRefs.length).toBeGreaterThanOrEqual(5)
    })

    it('would detect a hypothetical new collection with media fields', () => {
      // This test demonstrates that the introspection mechanism would work
      // for any collection that follows Payload's field patterns.

      // We can verify this by checking that the introspection correctly
      // handles all field types that might contain references

      const fileRefs = discoverReferencesForCollection(payload, 'files')
      const imageRefs = discoverReferencesForCollection(payload, 'images')

      // Both should return arrays (even if empty)
      expect(Array.isArray(fileRefs)).toBe(true)
      expect(Array.isArray(imageRefs)).toBe(true)

      // The introspection should cover:
      // 1. Simple upload fields
      // 2. Array-nested fields
      // 3. Tabbed fields
      // 4. Lexical block fields

      // Verify we have references of different structural types
      const hasSimpleField = fileRefs.some((r) => !r.fieldPath.includes('*'))
      const hasArrayField = fileRefs.some((r) => r.fieldPath.includes('*'))

      expect(hasSimpleField).toBe(true)
      expect(hasArrayField).toBe(true)

      // Verify we have both regular and Lexical block references for images
      const hasLexicalBlock = imageRefs.some((r) => r.isLexicalBlock)
      const hasRegularField = imageRefs.some((r) => !r.isLexicalBlock)

      expect(hasLexicalBlock).toBe(true)
      expect(hasRegularField).toBe(true)
    })
  })
})
