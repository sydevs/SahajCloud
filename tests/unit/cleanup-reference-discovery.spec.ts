/**
 * What the schema walk records about a reference, and what the extraction then
 * reads. Both halves decide whether a file in use reads as an orphan, and
 * CleanupOrphanedMedia trashes orphans (#977).
 */
import type { Field, Payload } from 'payload'

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

describe('extractIdsFromDocument', () => {
  it('reads every language of a localized array', () => {
    const doc = { panels: { en: [{ media: 1 }], fr: [{ media: 2 }] } }

    const ids = extractIdsFromDocument(doc, reference('panels.*.media', [0]))

    expect([...ids].sort()).toEqual([1, 2])
  })

  it('reads a group whose subfields are named like locales as one value', () => {
    // Nothing marked this segment, so the keys are subfield names and the
    // value under `en` is the reference — not a translation of the group.
    const doc = { translations: { en: 7, fr: 8 } }

    const ids = extractIdsFromDocument(doc, reference('translations.en', []))

    expect([...ids]).toEqual([7])
  })

  it('reads a field under a named tab', () => {
    const doc = { default: { media: 9 } }

    const ids = extractIdsFromDocument(doc, reference('default.media', []))

    expect([...ids]).toEqual([9])
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
