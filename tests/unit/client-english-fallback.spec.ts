/**
 * `mergeEnglish` and `schemaLookups` — the pure half of the API-client English
 * fallback (#705).
 *
 * The hook around them is a locale guard plus one memoized read, and lives in
 * `translations-globals.int.spec.ts`. What is worth enumerating here is the
 * merge itself, because "blank" has four shapes (missing key, empty string,
 * whitespace, null richText) and one of them must NOT be filled: a field the
 * caller's `select` stripped is absent from the document entirely, and
 * re-adding it would hand back a field they asked not to receive.
 */
import { describe, expect, it } from 'vitest'

import { mergeEnglish, schemaLookups } from '@/lib/translations/clientEnglishFallback'
import type { SchemaNode } from '@/lib/translations/schemaWalker'


const SCHEMA = {
  properties: {
    common: {
      type: 'object',
      properties: {
        loading: { type: 'string' },
        sessions_count: { type: 'string', plural: true },
        intro: { type: 'richText' },
      },
    },
    map: {
      type: 'object',
      properties: {
        general: { type: 'object', properties: { zoom_in: { type: 'string' } } },
        a11y: { type: 'object', properties: { marker_label: { type: 'string' } } },
      },
    },
  },
} as { properties: Record<string, SchemaNode> }

const LOOKUPS = schemaLookups(SCHEMA)

describe('schemaLookups', () => {
  it('walks simple tabs, nested sub-groups and richText siblings', () => {
    expect(LOOKUPS).toEqual(
      expect.arrayContaining([
        { groupField: null, fieldName: 'common', innerKey: 'loading' },
        { groupField: null, fieldName: 'common_intro', innerKey: null },
        { groupField: 'map', fieldName: 'general', innerKey: 'zoom_in' },
        { groupField: 'map', fieldName: 'a11y', innerKey: 'marker_label' },
      ]),
    )
  })

  // The merge fills what is STORED, and a plural key is stored as its CLDR
  // family. Without the expansion the family is never filled at all.
  it('expands a plural key into its four storage keys', () => {
    const plural = LOOKUPS.filter((l) => l.innerKey?.startsWith('sessions_count'))
    expect(plural.map((l) => l.innerKey)).toEqual([
      'sessions_count_one',
      'sessions_count_few',
      'sessions_count_many',
      'sessions_count_other',
    ])
  })
})

describe('mergeEnglish', () => {
  const english = {
    common: { loading: 'Loading…', sessions_count_one: '%{count} session' },
    common_intro: { root: { children: [{ text: 'Welcome' }] } },
    map: { general: { zoom_in: 'Zoom in' }, a11y: { marker_label: 'Class marker' } },
  }

  it('fills a key the locale omits entirely', () => {
    const merged = mergeEnglish({ common: {} }, english, LOOKUPS)
    expect(merged.common).toEqual({ loading: 'Loading…', sessions_count_one: '%{count} session' })
  })

  it('fills an empty string and a whitespace-only string', () => {
    const merged = mergeEnglish({ common: { loading: '   ' } }, english, LOOKUPS)
    expect((merged.common as Record<string, string>).loading).toBe('Loading…')
  })

  it('leaves a real translation alone', () => {
    const merged = mergeEnglish({ common: { loading: 'Chargement…' } }, english, LOOKUPS)
    expect((merged.common as Record<string, string>).loading).toBe('Chargement…')
  })

  it('fills a null richText sibling, and keeps one that has text', () => {
    expect(mergeEnglish({ common_intro: null }, english, LOOKUPS).common_intro).toEqual(
      english.common_intro,
    )
    const kept = { root: { children: [{ text: 'Bienvenue' }] } }
    expect(mergeEnglish({ common_intro: kept }, english, LOOKUPS).common_intro).toBe(kept)
  })

  it('reaches keys inside a nested sub-group', () => {
    const merged = mergeEnglish({ map: { general: {}, a11y: {} } }, english, LOOKUPS)
    expect(merged.map).toEqual({
      general: { zoom_in: 'Zoom in' },
      a11y: { marker_label: 'Class marker' },
    })
  })

  // The one case that must NOT be filled. An include-mode `select` strips the
  // field from the document; re-adding it would return a field the caller
  // explicitly excluded, and would make `select` unusable against these globals.
  it('never re-adds a field the document does not have', () => {
    const merged = mergeEnglish({ common: { loading: '' } }, english, LOOKUPS)
    expect(Object.hasOwn(merged, 'common_intro')).toBe(false)
    expect(Object.hasOwn(merged, 'map')).toBe(false)
  })

  it('does not mutate the document it was given', () => {
    const doc = { common: { loading: '' } }
    mergeEnglish(doc, english, LOOKUPS)
    expect(doc.common.loading).toBe('')
  })

  // `{ ...doc }` is one level deep, so a nested group's object is shared with
  // the input unless it is cloned too. The top-level case above passes either
  // way, which is why this one exists.
  it('does not mutate a nested group of the document it was given', () => {
    const doc = { map: { general: {} as Record<string, string>, a11y: {} } }
    const merged = mergeEnglish(doc, english, LOOKUPS)
    expect(doc.map.general.zoom_in).toBeUndefined()
    expect((merged.map as { general: Record<string, string> }).general.zoom_in).toBe('Zoom in')
  })

  it('skips a key English itself leaves blank, rather than writing an empty string', () => {
    const merged = mergeEnglish({ common: {} }, { common: { loading: '  ' } }, LOOKUPS)
    expect(Object.hasOwn(merged.common as object, 'loading')).toBe(false)
  })
})
