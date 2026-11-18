/**
 * Pins the nine non-English `wm-web-translations` seed files
 * (`seeds/wm-web-translations/data.<locale>.json`) to English and the schema.
 *
 * The files are drafted wording, hand-written and consumed verbatim by the
 * `wm-web-locales` seed, so nothing else would notice a dropped key, a blank,
 * a mangled placeholder or a string over a strict limit. Payload refuses an
 * undeclared key at write time, but only for the locale being written, and
 * says nothing about a key a translator forgot.
 *
 * What it holds each locale to:
 *
 * - **Exactly English's key set, minus `video`.** The video tab is dropped on
 *   purpose (the new player ships its own labels, sydevs/WeMeditateWeb#242), so
 *   a `video` key here is an error, not a bonus.
 * - **Every placeholder survives.** Each `%{name}`, tag or entity in the English
 *   string appears in the translation, and the translation invents none.
 * - **The plural forms the language needs.** `pluralize()` in WeMeditateWeb
 *   selects with `Intl.PluralRules`, so a Slavic locale must carry few/many; a
 *   form the language never selects is allowed but not required.
 * - **No blank, no padding, no leaked key path** (`errors.general.try_again`).
 * - **Strict limits.** A `strict` maxLength is a save gate, measured on the raw
 *   string, and would fail the seed on that locale.
 *
 * Unit lane: pure JSON in, no Payload bootstrap.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { PLURAL_CATEGORIES, pluralStorageKeys } from '@/lib/translations/pluralCategories'
import { collectLeafLookups, type SchemaNode } from '@/lib/translations/schemaWalker'

import { WM_WEB_TRANSLATION_LOCALES, wmWebTranslationsDataFile } from '../../seeds/lib/dataFiles'
import schemaJson from '../../src/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }

/** Tabs a non-English locale leaves to English. */
const OMITTED_TABS = ['video']

type LeafProp = { type: string; plural?: boolean; maxLength?: number; strict?: boolean }

const schema = schemaJson as unknown as { properties: Record<string, SchemaNode> }

function readSeed(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), file), 'utf8')) as Record<
    string,
    unknown
  >
}

const english = readSeed('seeds/wm-web-translations/data.en.json')

/** `<tab>.<sub-group>.<key>` for a nested tab, `<tab>.<key>` for a flat one. */
function valueAt(seed: Record<string, unknown>, segments: string[]): unknown {
  let node: unknown = seed
  for (const segment of segments) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return node
}

interface DeclaredKey {
  /** The declared name, `_one` etc. not applied. */
  segments: string[]
  prop: LeafProp
}

function declaredKeys(): DeclaredKey[] {
  const out: DeclaredKey[] = []
  for (const [tabSlug, tabNode] of Object.entries(schema.properties)) {
    if (OMITTED_TABS.includes(tabSlug)) continue
    for (const lookup of collectLeafLookups(tabSlug, tabNode, { expandPlurals: false })) {
      const { groupField, fieldName, innerKey } = lookup
      if (innerKey === null) continue
      const source =
        groupField === null
          ? tabNode
          : ((tabNode.properties ?? {})[fieldName] as SchemaNode | undefined)
      const prop = (source?.properties ?? {})[innerKey] as LeafProp | undefined
      if (!prop || prop.type !== 'string') continue
      out.push({
        segments: [groupField, fieldName, innerKey].filter((part): part is string => part !== null),
        prop,
      })
    }
  }
  return out
}

/** Every placeholder, tag and entity form a translator must carry across. */
function tokensOf(value: string): string[] {
  return (value.match(/%\{\w+\}|<\/?[a-zA-Z][^>]*>|&#?\w+;|\{\{?\w+\}?\}/g) ?? []).sort()
}

/**
 * The plural categories this language selects for a whole number, plus
 * `other`. Whole numbers only: `many` in French or Czech is for decimals or
 * millions, which a count never is here, so those locales are not asked for it.
 */
function requiredCategories(locale: string): string[] {
  const rules = new Intl.PluralRules(locale)
  const reached = new Set<string>(['other'])
  for (let n = 0; n <= 1000; n += 1) reached.add(rules.select(n))
  return PLURAL_CATEGORIES.filter((category) => reached.has(category))
}

const keys = declaredKeys()

describe('wm-web-translations locale seeds', () => {
  it('declares the keys it checks against (the walker found the schema)', () => {
    expect(keys.length).toBeGreaterThan(100)
  })

  it('covers the ten launch languages with English', () => {
    expect([...WM_WEB_TRANSLATION_LOCALES].sort()).toEqual(
      ['bg', 'cs', 'de', 'es', 'fr', 'it', 'pt-BR', 'ru', 'uk'].sort(),
    )
  })

  it('knows which plural forms the Slavic languages and Czech need', () => {
    // Guards `requiredCategories`: if the runtime's ICU data lacked these, every
    // locale below would pass while asking for too little.
    expect(requiredCategories('ru')).toEqual(['one', 'few', 'many', 'other'])
    expect(requiredCategories('uk')).toEqual(['one', 'few', 'many', 'other'])
    expect(requiredCategories('cs')).toEqual(['one', 'few', 'other'])
    expect(requiredCategories('fr')).toEqual(['one', 'other'])
  })

  describe.each([...WM_WEB_TRANSLATION_LOCALES])('%s', (locale) => {
    const seed = readSeed(wmWebTranslationsDataFile(locale))
    const required = requiredCategories(locale)

    it('names its own locale in _meta, so a file in the wrong slot is caught', () => {
      expect((seed._meta as { locale?: unknown } | undefined)?.locale).toBe(locale)
    })

    it('carries no tab English does not, and none of the omitted ones', () => {
      const tabs = Object.keys(seed).filter((key) => key !== '_meta')
      const expected = Object.keys(english).filter(
        (key) => key !== '_meta' && !OMITTED_TABS.includes(key),
      )
      expect(tabs.sort()).toEqual(expected.sort())
    })

    it('has exactly English’s key set, with this language’s plural forms', () => {
      const missing: string[] = []
      const expectedStored = new Set<string>()

      for (const { segments, prop } of keys) {
        const parent = segments.slice(0, -1)
        const name = segments[segments.length - 1] ?? ''
        const stored = prop.plural === true ? required.map((c) => `${name}_${c}`) : [name]
        for (const key of stored) {
          const path_ = [...parent, key].join('.')
          expectedStored.add(path_)
          if (typeof valueAt(seed, [...parent, key]) !== 'string') missing.push(path_)
        }
      }
      expect(missing).toEqual([])

      // Everything present must be a key the schema allows: the full CLDR
      // family for a plural key (`many` for Czech decimals is legal), the key
      // itself otherwise. A stray or misspelled key fails here.
      const allowed = new Set<string>()
      for (const { segments, prop } of keys) {
        const parent = segments.slice(0, -1)
        const name = segments[segments.length - 1] ?? ''
        for (const key of prop.plural === true ? pluralStorageKeys(name) : [name]) {
          allowed.add([...parent, key].join('.'))
        }
      }
      const present: string[] = []
      for (const [tab, tabValue] of Object.entries(seed)) {
        if (tab === '_meta' || tabValue === null || typeof tabValue !== 'object') continue
        for (const [inner, innerValue] of Object.entries(tabValue as Record<string, unknown>)) {
          if (innerValue !== null && typeof innerValue === 'object') {
            for (const leaf of Object.keys(innerValue as Record<string, unknown>)) {
              present.push(`${tab}.${inner}.${leaf}`)
            }
          } else {
            present.push(`${tab}.${inner}`)
          }
        }
      }
      expect(present.filter((key) => !allowed.has(key))).toEqual([])
      expect(expectedStored.size).toBeGreaterThan(100)
    })

    it('leaves no value blank, padded, or equal to its own key path', () => {
      const bad: string[] = []
      for (const { segments, prop } of keys) {
        const parent = segments.slice(0, -1)
        const name = segments[segments.length - 1] ?? ''
        for (const key of prop.plural === true ? pluralStorageKeys(name) : [name]) {
          const value = valueAt(seed, [...parent, key])
          if (typeof value !== 'string') continue
          const full = [...parent, key].join('.')
          if (value.trim() === '' || value !== value.trim() || value === full) bad.push(full)
        }
      }
      expect(bad).toEqual([])
    })

    it('keeps every placeholder, tag and entity, and invents none', () => {
      const problems: string[] = []
      for (const { segments, prop } of keys) {
        const parent = segments.slice(0, -1)
        const name = segments[segments.length - 1] ?? ''
        const englishKeys = prop.plural === true ? [`${name}_one`, `${name}_other`] : [name]
        const englishTokens = new Set<string>()
        for (const key of englishKeys) {
          const value = valueAt(english, [...parent, key])
          if (typeof value === 'string') tokensOf(value).forEach((t) => englishTokens.add(t))
        }

        for (const key of prop.plural === true ? pluralStorageKeys(name) : [name]) {
          const value = valueAt(seed, [...parent, key])
          if (typeof value !== 'string') continue
          const full = [...parent, key].join('.')
          const got = new Set(tokensOf(value))
          for (const token of englishTokens) {
            if (!got.has(token)) problems.push(`${full}: lost ${token}`)
          }
          for (const token of got) {
            if (!englishTokens.has(token)) problems.push(`${full}: invented ${token}`)
          }
        }
      }
      expect(problems).toEqual([])
    })

    it('keeps every strict value inside its own limit', () => {
      const over: string[] = []
      for (const { segments, prop } of keys) {
        if (prop.strict !== true || typeof prop.maxLength !== 'number') continue
        const parent = segments.slice(0, -1)
        const name = segments[segments.length - 1] ?? ''
        for (const key of prop.plural === true ? pluralStorageKeys(name) : [name]) {
          const value = valueAt(seed, [...parent, key])
          if (typeof value === 'string' && [...value].length > prop.maxLength) {
            over.push(`${[...parent, key].join('.')} (${[...value].length}/${prop.maxLength})`)
          }
        }
      }
      expect(over).toEqual([])
    })
  })
})
