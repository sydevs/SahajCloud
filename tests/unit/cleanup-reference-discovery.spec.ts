/**
 * What the schema walk records about a reference, and what the extraction then
 * reads. Both halves decide whether a file in use reads as an orphan, and
 * CleanupOrphanedMedia trashes orphans (#977).
 */
import type { Block, Field, Payload } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  discoverReferencesForCollection,
  extractIdsFromDocument,
  localeValues,
  type FieldReference,
} from '@/jobs/CleanupOrphanedMedia/schemaUtils'

/** Discover references to `files` in a collection made of `fields`. */
function walk(fields: Field[]): FieldReference[] {
  const payload = { collections: { lessons: { config: { fields } } } } as unknown as Payload
  return discoverReferencesForCollection(payload, 'files')
}

const media: Field = { name: 'media', type: 'upload', relationTo: 'files' }

function reference(fieldPath: string, localizedAt: number[]): FieldReference {
  return {
    collection: 'lessons',
    fieldPath,
    fieldType: 'upload',
    hasMany: false,
    relationTo: 'files',
    isLexicalBlock: false,
    localizedAt,
  }
}

/** The same reference, as the walk records it for a polymorphic field. */
function polymorphicReference(fieldPath: string): FieldReference {
  return { ...reference(fieldPath, []), relationTo: ['meditations', 'files'] }
}

describe('discoverReferencesForCollection', () => {
  it('records the localized array, not the item it holds', () => {
    const fields: Field[] = [{ name: 'panels', type: 'array', localized: true, fields: [media] }]

    expect(walk(fields)).toEqual([
      expect.objectContaining({ fieldPath: 'panels.*.media', localizedAt: [0] }),
    ])
  })

  it('records nothing for the same array unlocalized', () => {
    const fields: Field[] = [{ name: 'panels', type: 'array', fields: [media] }]

    expect(walk(fields)).toEqual([
      expect.objectContaining({ fieldPath: 'panels.*.media', localizedAt: [] }),
    ])
  })

  it('records a localized upload field at its own segment', () => {
    const fields: Field[] = [{ ...media, localized: true } as Field]

    expect(walk(fields)).toEqual([
      expect.objectContaining({ fieldPath: 'media', localizedAt: [0] }),
    ])
  })

  it('names a field under a named tab without a leading dot', () => {
    // AppCards nests named tabs inside unnamed ones, so the path starts empty
    // and `.default.media` was never a key any document had.
    const fields: Field[] = [
      {
        type: 'tabs',
        tabs: [
          {
            label: 'Appearance',
            fields: [{ type: 'tabs', tabs: [{ name: 'default', fields: [media] }] }],
          },
        ],
      },
    ]

    expect(walk(fields)).toEqual([
      expect.objectContaining({ fieldPath: 'default.media', localizedAt: [] }),
    ])
  })
})

describe('discoverReferencesForCollection, Lexical blocks', () => {
  /** A richText field whose editor accepts `blocks`, shaped as Payload sanitizes it. */
  function richTextOver(blocks: Block[]): Field {
    return {
      name: 'content',
      type: 'richText',
      editor: {
        editorConfig: {
          resolvedFeatureMap: new Map<string, unknown>([
            ['blocks', { sanitizedServerFeatureProps: { blocks } }],
          ]),
        },
      },
    } as unknown as Field
  }

  it('records the name of each block field pointing at the target, and no other', () => {
    const blocks = [
      { slug: 'textbox', fields: [{ name: 'image', type: 'upload', relationTo: 'images' }] },
      { slug: 'layout', fields: [{ name: 'items', type: 'array', fields: [media] }] },
    ] as Block[]

    const references = walk([richTextOver(blocks)])

    expect(references).toHaveLength(1)
    expect(references[0].lexicalFields).toEqual(new Map([['layout', new Set(['media'])]]))
  })

  it('records an empty map for an editor that accepts no blocks', () => {
    expect(walk([richTextOver([])])[0].lexicalFields).toEqual(new Map())
  })
})

describe('extractIdsFromDocument', () => {
  it('reads every language of a localized array', () => {
    const doc = { panels: { en: [{ media: 1 }], fr: [{ media: 2 }] } }

    const ids = extractIdsFromDocument(doc, reference('panels.*.media', [0]), 'files')

    expect([...ids].sort()).toEqual([1, 2])
  })

  it('reads a group whose subfields are named like locales as one value', () => {
    // Nothing marked this segment, so the keys are subfield names and the
    // value under `en` is the reference — not a translation of the group.
    const doc = { translations: { en: 7, fr: 8 } }

    const ids = extractIdsFromDocument(doc, reference('translations.en', []), 'files')

    expect([...ids]).toEqual([7])
  })

  it('reads a field under a named tab', () => {
    const doc = { default: { media: 9 } }

    const ids = extractIdsFromDocument(doc, reference('default.media', []), 'files')

    expect([...ids]).toEqual([9])
  })

  /**
   * ⚠ **A polymorphic value is `{ relationTo, value }` at depth 0**, so a
   * reader that only knows `.id` answers nothing and the file reads as an
   * orphan — which the job trashes. `transcripts.source` is the live case:
   * a transcript's hold on its recording would be invisible (#1043).
   */
  it('reads the id a polymorphic value carries for this target', () => {
    const doc = { source: { relationTo: 'files', value: 11 } }

    const ids = extractIdsFromDocument(doc, polymorphicReference('source'), 'files')

    expect([...ids]).toEqual([11])
  })

  /**
   * ⚠ **And the other half, which a blind `obj.value` would get wrong.** Each
   * collection numbers its own rows, so reading the id without checking the
   * target would let meditation 11 protect file 11 from the sweep — worse than
   * the bug above, because it keeps a file nothing references.
   */
  it('ignores a polymorphic value naming another collection', () => {
    const doc = { source: { relationTo: 'meditations', value: 11 } }

    const ids = extractIdsFromDocument(doc, polymorphicReference('source'), 'files')

    expect([...ids]).toEqual([])
  })

  it('reads a populated polymorphic value for this target', () => {
    const doc = { source: { relationTo: 'files', value: { id: 12, filename: 'cues.mp3' } } }

    const ids = extractIdsFromDocument(doc, polymorphicReference('source'), 'files')

    expect([...ids]).toEqual([12])
  })
})

describe('localeValues', () => {
  it('splits a locale map only where the walk recorded one', () => {
    const map = { en: [{ media: 1 }], fr: [{ media: 2 }] }

    expect(localeValues(map, true)).toEqual([[{ media: 1 }], [{ media: 2 }]])
    expect(localeValues(map, false)).toEqual([map])
  })

  it('leaves an array, a scalar and an empty object alone', () => {
    expect(localeValues([{ media: 1 }], true)).toEqual([[{ media: 1 }]])
    expect(localeValues(7, true)).toEqual([7])
    expect(localeValues({}, true)).toEqual([])
  })
})
