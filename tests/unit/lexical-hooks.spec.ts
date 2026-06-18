import { describe, expect, it } from 'vitest'

import { removeDanglingLexicalReferences } from '@/lib/richEditor/lexicalHooks'

const validCollections = ['pages', 'lectures', 'images']

function lexicalWithChildren(children: unknown[]) {
  return {
    root: {
      type: 'root',
      children,
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

describe('removeDanglingLexicalReferences', () => {
  it('removes relationship nodes that point at removed collections', () => {
    const content = lexicalWithChildren([
      {
        type: 'relationship',
        version: 2,
        format: '',
        relationTo: 'lecture-clips',
        value: 123,
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Keep me', version: 1 }],
        version: 1,
      },
    ])

    const sanitized = removeDanglingLexicalReferences(content, validCollections) as typeof content

    expect(sanitized.root.children).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Keep me', version: 1 }],
        version: 1,
      },
    ])
  })

  it('removes upload and relationship nodes with null values', () => {
    const content = lexicalWithChildren([
      {
        type: 'upload',
        version: 3,
        relationTo: 'images',
        value: null,
      },
      {
        type: 'relationship',
        version: 2,
        relationTo: 'lectures',
        value: undefined,
      },
    ])

    const sanitized = removeDanglingLexicalReferences(content, validCollections) as typeof content

    expect(sanitized.root.children).toEqual([])
  })

  it('removes upload nodes that point at removed collections', () => {
    const content = lexicalWithChildren([
      {
        type: 'upload',
        version: 3,
        format: '',
        relationTo: 'lecture-clips',
        value: 123,
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Keep me', version: 1 }],
        version: 1,
      },
    ])

    const sanitized = removeDanglingLexicalReferences(content, validCollections) as typeof content

    expect(sanitized.root.children).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Keep me', version: 1 }],
        version: 1,
      },
    ])
  })

  it('preserves valid references and sanitizes nested children', () => {
    const validRelationship = {
      type: 'relationship',
      version: 2,
      format: '',
      relationTo: 'lectures',
      value: 456,
    }
    const content = lexicalWithChildren([
      {
        type: 'paragraph',
        children: [
          {
            type: 'relationship',
            version: 2,
            format: '',
            relationTo: 'lecture-clips',
            value: 123,
          },
          { type: 'text', text: 'Keep nested text', version: 1 },
        ],
        version: 1,
      },
      validRelationship,
    ])

    const sanitized = removeDanglingLexicalReferences(content, validCollections) as typeof content

    expect(sanitized.root.children).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Keep nested text', version: 1 }],
        version: 1,
      },
      validRelationship,
    ])
  })
})
