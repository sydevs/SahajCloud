import { describe, it, expect } from 'vitest'

import {
  convertToContentIndex,
  revertFromContentIndex,
} from '../../src/migrations/20260409_180000_unify_index_blocks'

/** Helper to create a Lexical document with block nodes inside root.children */
function makeLexicalDoc(blocks: Record<string, unknown>[]) {
  return {
    root: {
      type: 'root',
      children: blocks.map((fields) => ({
        type: 'block',
        version: 2,
        fields,
      })),
    },
  }
}

describe('Unify index blocks migration', () => {
  describe('convertToContentIndex (up)', () => {
    it('converts meditations-index to content-index with type and renamed filters', () => {
      const doc = makeLexicalDoc([
        {
          id: 'abc123',
          blockName: 'Meditation Filters',
          blockType: 'meditations-index',
          filters: [1, 2, 3],
        },
      ])

      const changed = convertToContentIndex(doc)

      expect(changed).toBe(true)
      const block = doc.root.children[0].fields
      expect(block.blockType).toBe('content-index')
      expect(block.type).toBe('meditations')
      expect(block.meditationFilters).toEqual([1, 2, 3])
      expect(block.filters).toBeUndefined()
      expect(block.id).toBe('abc123')
      expect(block.blockName).toBe('Meditation Filters')
    })

    it('converts pages-index to content-index with pageFilters', () => {
      const doc = makeLexicalDoc([
        {
          id: 'def456',
          blockName: 'Page Tags',
          blockType: 'pages-index',
          filters: ['wisdom', 'lifestyle'],
        },
      ])

      const changed = convertToContentIndex(doc)

      expect(changed).toBe(true)
      const block = doc.root.children[0].fields
      expect(block.blockType).toBe('content-index')
      expect(block.type).toBe('pages')
      expect(block.pageFilters).toEqual(['wisdom', 'lifestyle'])
      expect(block.filters).toBeUndefined()
    })

    it('converts songs-index to content-index with songFilters', () => {
      const doc = makeLexicalDoc([
        {
          id: 'ghi789',
          blockName: 'Music Library',
          blockType: 'songs-index',
          filters: [10, 20],
        },
      ])

      const changed = convertToContentIndex(doc)

      expect(changed).toBe(true)
      const block = doc.root.children[0].fields
      expect(block.blockType).toBe('content-index')
      expect(block.type).toBe('songs')
      expect(block.songFilters).toEqual([10, 20])
      expect(block.filters).toBeUndefined()
    })

    it('converts multiple different index blocks in the same document', () => {
      const doc = makeLexicalDoc([
        { id: '1', blockName: '', blockType: 'meditations-index', filters: [1] },
        { id: '2', blockName: '', blockType: 'pages-index', filters: ['wisdom'] },
        { id: '3', blockName: '', blockType: 'songs-index', filters: [10] },
      ])

      const changed = convertToContentIndex(doc)

      expect(changed).toBe(true)
      expect(doc.root.children[0].fields.blockType).toBe('content-index')
      expect(doc.root.children[0].fields.type).toBe('meditations')
      expect(doc.root.children[1].fields.blockType).toBe('content-index')
      expect(doc.root.children[1].fields.type).toBe('pages')
      expect(doc.root.children[2].fields.blockType).toBe('content-index')
      expect(doc.root.children[2].fields.type).toBe('songs')
    })

    it('returns false when no matching blocks exist', () => {
      const doc = makeLexicalDoc([
        { id: '1', blockName: '', blockType: 'quote', text: 'Hello' },
      ])

      const changed = convertToContentIndex(doc)
      expect(changed).toBe(false)
    })

    it('leaves non-index blocks unchanged', () => {
      const doc = makeLexicalDoc([
        { id: '1', blockName: 'Quote', blockType: 'quote', text: 'Hello', credit: 'Author' },
        { id: '2', blockName: '', blockType: 'meditations-index', filters: [1] },
      ])

      const changed = convertToContentIndex(doc)

      expect(changed).toBe(true)
      expect(doc.root.children[0].fields.blockType).toBe('quote')
      expect(doc.root.children[0].fields.text).toBe('Hello')
      expect(doc.root.children[1].fields.blockType).toBe('content-index')
    })
  })

  describe('revertFromContentIndex (down)', () => {
    it('reverts meditations content-index back to meditations-index', () => {
      const doc = makeLexicalDoc([
        {
          id: 'abc123',
          blockName: 'Meditation Filters',
          blockType: 'content-index',
          type: 'meditations',
          meditationFilters: [1, 2, 3],
        },
      ])

      const changed = revertFromContentIndex(doc)

      expect(changed).toBe(true)
      const block = doc.root.children[0].fields
      expect(block.blockType).toBe('meditations-index')
      expect(block.filters).toEqual([1, 2, 3])
      expect(block.type).toBeUndefined()
      expect(block.meditationFilters).toBeUndefined()
      expect(block.id).toBe('abc123')
      expect(block.blockName).toBe('Meditation Filters')
    })

    it('reverts pages content-index back to pages-index', () => {
      const doc = makeLexicalDoc([
        {
          id: 'def456',
          blockName: '',
          blockType: 'content-index',
          type: 'pages',
          pageFilters: ['wisdom', 'lifestyle'],
        },
      ])

      const changed = revertFromContentIndex(doc)

      expect(changed).toBe(true)
      const block = doc.root.children[0].fields
      expect(block.blockType).toBe('pages-index')
      expect(block.filters).toEqual(['wisdom', 'lifestyle'])
      expect(block.type).toBeUndefined()
      expect(block.pageFilters).toBeUndefined()
    })

    it('reverts songs content-index back to songs-index', () => {
      const doc = makeLexicalDoc([
        {
          id: 'ghi789',
          blockName: '',
          blockType: 'content-index',
          type: 'songs',
          songFilters: [10, 20],
        },
      ])

      const changed = revertFromContentIndex(doc)

      expect(changed).toBe(true)
      const block = doc.root.children[0].fields
      expect(block.blockType).toBe('songs-index')
      expect(block.filters).toEqual([10, 20])
    })

    it('does not revert content-index with lectures type (no old block)', () => {
      const doc = makeLexicalDoc([
        {
          id: '1',
          blockName: '',
          blockType: 'content-index',
          type: 'lectures',
        },
      ])

      const changed = revertFromContentIndex(doc)
      expect(changed).toBe(false)
      expect(doc.root.children[0].fields.blockType).toBe('content-index')
    })
  })

  describe('round-trip', () => {
    it('convert then revert produces original data', () => {
      const original = makeLexicalDoc([
        { id: '1', blockName: 'M', blockType: 'meditations-index', filters: [1, 2] },
        { id: '2', blockName: 'P', blockType: 'pages-index', filters: ['wisdom'] },
        { id: '3', blockName: 'S', blockType: 'songs-index', filters: [10] },
      ])

      const originalSnapshot = JSON.stringify(original)

      convertToContentIndex(original)
      revertFromContentIndex(original)

      expect(JSON.stringify(original)).toBe(originalSnapshot)
    })
  })
})
