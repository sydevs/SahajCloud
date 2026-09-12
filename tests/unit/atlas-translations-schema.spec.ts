/**
 * The Sahaj Atlas translations schema, and the ten seed files beside it (#706).
 *
 * Three contracts, none of which any type can express:
 *
 * 1. **Three groups mirror code, not copy.** `registration.questions` keys are
 *    the question names a registration is stored under, `event.title` keys are
 *    the auto-title slots, and `emails` keys are what the email resolver reads.
 *    A key renamed on one side alone renders blank, or silently stops matching.
 * 2. **A seed may only write keys the schema declares.** Since #705 each JSON
 *    column validates against its own schema on write, so an undeclared key
 *    fails the seed run rather than the review.
 * 3. **A translation may not invent a placeholder.** `%{x}` is substituted from
 *    a fixed set per key. A placeholder English does not have is never
 *    supplied, so it renders literally in front of a visitor.
 */
import { readFileSync } from 'fs'
import path from 'path'

import { describe, expect, it } from 'vitest'

import schemaJson from '@/globals/SahajAtlasTranslations/translationsSchema.json' with { type: 'json' }
import { EVENT_TITLE_SLOTS } from '@/lib/eventTitle/compose'
import { EVENT_REGISTRATION_QUESTIONS } from '@/lib/registrations/questions'
import { EMAIL_STRING_DEFAULTS } from '@/lib/translations/emailStrings'
import { PLURAL_CATEGORIES } from '@/lib/translations/pluralCategories'


const SEED_LOCALES = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'nl', 'pt-BR', 'ru', 'uk'] as const

type Leaf = {
  type: 'string' | 'richText'
  maxLength?: number
  strict?: boolean
  plural?: boolean
  description?: string
}
type Node = { type: 'object'; properties?: Record<string, Leaf | Node>; additionalProperties?: boolean }

const schema = schemaJson as unknown as Node

const isNode = (n: Leaf | Node): n is Node => n.type === 'object'

function group(...pathSegments: string[]): Node {
  let node: Leaf | Node = schema
  for (const segment of pathSegments) {
    if (!isNode(node)) throw new Error(`${pathSegments.join('.')} is not a group`)
    const next: Leaf | Node | undefined = node.properties?.[segment]
    if (!next) throw new Error(`${pathSegments.join('.')} does not exist in the schema`)
    node = next
  }
  if (!isNode(node)) throw new Error(`${pathSegments.join('.')} is not a group`)
  return node
}

/** Every declared key, as its dotted path, with plural keys left unexpanded. */
function declaredKeys(node: Node = schema, prefix = ''): string[] {
  return Object.entries(node.properties ?? {}).flatMap(([key, child]) =>
    isNode(child) ? declaredKeys(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
}

/** Every key a locale may store, with plural keys expanded to their family. */
function storageKeys(node: Node = schema, prefix = ''): Set<string> {
  const out = new Set<string>()
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    if (isNode(child)) {
      for (const nested of storageKeys(child, `${prefix}${key}.`)) out.add(nested)
    } else if (child.plural) {
      for (const category of PLURAL_CATEGORIES) out.add(`${prefix}${key}_${category}`)
    } else {
      out.add(`${prefix}${key}`)
    }
  }
  return out
}

function leaf(dotted: string): Leaf {
  const segments = dotted.split('.')
  const key = segments.pop() as string
  const found = group(...segments).properties?.[key]
  if (!found || isNode(found)) throw new Error(`${dotted} is not a leaf key`)
  return found
}

type SeedFile = Record<string, unknown>

function readSeed(locale: string): SeedFile {
  const file = path.resolve(process.cwd(), `seeds/sy-atlas-translations/data.${locale}.json`)
  return JSON.parse(readFileSync(file, 'utf8')) as SeedFile
}

/** Flattens a seed file to dotted key → value, dropping the `_meta` header. */
function seedEntries(data: SeedFile, prefix = ''): Array<[string, unknown]> {
  return Object.entries(data).flatMap(([key, value]) => {
    if (prefix === '' && key === '_meta') return []
    return value && typeof value === 'object' && !Array.isArray(value)
      ? seedEntries(value as SeedFile, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value] as [string, unknown]]
  })
}

/** `%{name}` placeholders in a string, as a set. */
function placeholders(value: string): Set<string> {
  return new Set(Array.from(value.matchAll(/%\{(\w+)\}/g), (m) => m[1] as string))
}

/** `sessions_count_one` → `sessions_count`, so a family collapses to one name. */
function collapsePlurals(keys: Iterable<string>): Set<string> {
  const suffix = new RegExp(`_(${PLURAL_CATEGORIES.join('|')})$`)
  return new Set(Array.from(keys, (key) => key.replace(suffix, '')))
}

describe('atlas translations schema', () => {
  it('has the eleven view tabs, in order', () => {
    expect(Object.keys(schema.properties ?? {})).toEqual([
      'common',
      'countries',
      'search',
      'filters',
      'online',
      'event',
      'calendar',
      'registration',
      'share',
      'compact',
      'emails',
    ])
  })

  it('names registration.questions exactly after EVENT_REGISTRATION_QUESTIONS, in order', () => {
    expect(Object.keys(group('registration', 'questions').properties ?? {})).toEqual(
      EVENT_REGISTRATION_QUESTIONS.map((q) => q.name),
    )
  })

  it('names event.title exactly after EVENT_TITLE_SLOTS', () => {
    expect(Object.keys(group('event', 'title').properties ?? {}).sort()).toEqual(
      [...EVENT_TITLE_SLOTS].sort(),
    )
  })

  it('names emails exactly after EMAIL_STRING_DEFAULTS, plural families collapsed', () => {
    expect([...collapsePlurals(Object.keys(group('emails').properties ?? {}))].sort()).toEqual(
      [...collapsePlurals(Object.keys(EMAIL_STRING_DEFAULTS))].sort(),
    )
  })

  it('gives every strict key a maxLength to be strict about', () => {
    const strictWithoutLimit = declaredKeys().filter(
      (key) => leaf(key).strict === true && leaf(key).maxLength === undefined,
    )
    expect(strictWithoutLimit).toEqual([])
  })

  it('makes the widget’s own copy budgets blocking', () => {
    // These seven are `i18n-budgets.test.ts` in sydevs/SahajAtlasWeb: each one
    // sits in a slot that breaks rather than merely looking untidy. (#706's
    // acceptance criteria say "six" while its own budget list names seven —
    // the list is what the widget enforces, so the list is what is pinned.)
    expect(
      Object.fromEntries(
        (
          [
            'event.display.chip_full',
            'event.display.chip_today',
            'event.display.chip_ended',
            'event.display.event_full',
            'event.display.contact_to_join_full',
            'common.feedback.confirmed_title',
            'common.feedback.denied_title',
          ] as const
        ).map((key) => [key, [leaf(key).maxLength, leaf(key).strict]]),
      ),
    ).toEqual({
      'event.display.chip_full': [14, true],
      'event.display.chip_today': [14, true],
      'event.display.chip_ended': [14, true],
      'event.display.event_full': [36, true],
      'event.display.contact_to_join_full': [40, true],
      'common.feedback.confirmed_title': [40, true],
      'common.feedback.denied_title': [40, true],
    })
  })

  it('declares the course session count as a plural key', () => {
    expect(leaf('event.display.sessions_count').plural).toBe(true)
  })

  // Every other assertion here filters a list. This one states its size, so
  // none of them can pass by walking an empty schema.
  it('declares 193 widget-facing keys across 33 leaf groups', () => {
    const leafGroups = (node: Node): number =>
      Object.values(node.properties ?? {}).some(isNode)
        ? Object.values(node.properties ?? {})
            .filter(isNode)
            .reduce((n, child) => n + leafGroups(child), 0)
        : 1

    expect(leafGroups(schema)).toBe(33)
    expect(
      declaredKeys().filter((key) => !key.startsWith('emails.') && !key.startsWith('event.title.'))
        .length,
    ).toBe(193)
  })

  it('describes every key, naming where it appears', () => {
    const undescribed = declaredKeys().filter((key) => !(leaf(key).description ?? '').trim())
    expect(undescribed).toEqual([])
  })
})

describe('atlas translations seeds', () => {
  const declared = storageKeys()

  it.each(SEED_LOCALES)('data.%s.json writes only keys the schema declares', (locale) => {
    const undeclared = seedEntries(readSeed(locale))
      .map(([key]) => key)
      .filter((key) => !declared.has(key))
    expect(undeclared).toEqual([])
  })

  it.each(SEED_LOCALES)('data.%s.json holds a non-blank string for every key', (locale) => {
    const blank = seedEntries(readSeed(locale)).filter(
      ([, value]) => typeof value !== 'string' || value.trim().length === 0,
    )
    expect(blank).toEqual([])
  })

  // Both groups hold live production data. A seed that carried either would
  // overwrite registrant email chrome, or the CMS auto-titles, on every run.
  it.each(SEED_LOCALES)('data.%s.json carries neither emails nor event.title', (locale) => {
    const owned = seedEntries(readSeed(locale))
      .map(([key]) => key)
      .filter((key) => key.startsWith('emails.') || key.startsWith('event.title.'))
    expect(owned).toEqual([])
  })

  // English is the source the merge serves every other locale from, so a key
  // it misses is a key nothing can render. `few` and `many` are exempt:
  // English has no such plural category, and a value there would be invented.
  it('data.en.json covers every widget-facing key', () => {
    const seeded = new Set(seedEntries(readSeed('en')).map(([key]) => key))
    const missing = [...declared].filter(
      (key) =>
        !seeded.has(key) &&
        !key.startsWith('emails.') &&
        !key.startsWith('event.title.') &&
        !/_(few|many)$/.test(key),
    )
    expect(missing).toEqual([])
    expect(seeded.size).toBeGreaterThan(150)
  })

  it.each(SEED_LOCALES.filter((l) => l !== 'en'))(
    'data.%s.json invents no placeholder English lacks',
    (locale) => {
      const english = new Map(seedEntries(readSeed('en')) as Array<[string, string]>)

      // A plural category English does not use (`few`, `many`) has no English
      // value of its own, so `other` is what it must agree with.
      const reference = (key: string): string =>
        english.get(key) ?? english.get(key.replace(/_(few|many)$/, '_other')) ?? ''

      const invented: Array<[string, string[]]> = []
      const entries = seedEntries(readSeed(locale)) as Array<[string, string]>

      for (const [key, value] of entries) {
        const allowed = placeholders(reference(key))
        const extra = [...placeholders(value)].filter((name) => !allowed.has(name))
        if (extra.length > 0) invented.push([key, extra])
      }

      expect(invented).toEqual([])
      expect(entries.length).toBeGreaterThan(150)
    },
  )
})
