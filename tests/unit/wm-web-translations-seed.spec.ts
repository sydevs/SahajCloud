/**
 * Pins `seeds/wm-web-translations/data.en.json` to the schema it seeds.
 *
 * The seed file is written by hand and consumed verbatim — the importer
 * strips `_meta` and hands the rest straight to `updateGlobal`. Nothing
 * transforms it, so nothing else would notice a key that drifted out of the
 * schema, a value left blank, or a `%{placeholder}` the translator was never
 * told about. Payload rejects an undeclared key on write, but only for a
 * locale someone actually seeds, and only at run time.
 *
 * It walks the schema with `collectLeafLookups` — the same walker
 * `clientEnglishFallback` uses to decide which keys to fill from English —
 * rather than re-deriving the data path here. A second copy of the nesting
 * rules is a second thing to get wrong.
 *
 * `_meta.schema_version` is pinned in `translations-seed-meta.spec.ts`, from
 * that same walker, alongside the other two translations seeds.
 *
 * Unit lane: pure JSON in, no Payload bootstrap.
 */

import { describe, expect, it } from 'vitest'

import { meditationTitleFromWeights } from '@/collections/Meditations/hooks/fallbackTitle'
import { PAGE_TAGS } from '@/lib/pageTags'
import { SUBTLE_SYSTEM_NODE_OPTIONS } from '@/lib/subtleSystem'
import { PLURAL_CATEGORIES, pluralStorageKeys } from '@/lib/translations/pluralCategories'
import { collectLeafLookups, type SchemaNode } from '@/lib/translations/schemaWalker'

import seedFile from '../../seeds/wm-web-translations/data.en.json' with { type: 'json' }
import schemaJson from '../../src/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }

/**
 * English has exactly two plural forms. `few` and `many` exist in the storage
 * family for Russian, Ukrainian and Czech, and `pluralize()` falls back to
 * `other` where a locale does not use them — so seeding them in English would
 * be inventing a form the language has no rule for.
 */
const ENGLISH_PLURAL_CATEGORIES = ['one', 'other'] as const

type LeafProp = {
  type: 'string' | 'richText'
  plural?: boolean
  description?: string
  maxLength?: number
  strict?: boolean
  default?: string
}

const schema = schemaJson as unknown as { properties: Record<string, SchemaNode> }
const seed = seedFile as unknown as Record<string, unknown>

/**
 * One declared string key, resolved to everything the assertions need:
 *
 * - `seeded` — the storage keys English is expected to fill. One per key,
 *   or the two English plural forms.
 * - `allowed` — every storage key the schema permits. The full CLDR family
 *   for a plural key, so `_few` and `_many` are legal but not required.
 *
 * Keeping both here is what makes the English-vs-full-family distinction
 * visible in one place, rather than as a ternary repeated per assertion.
 */
interface DeclaredKey {
  prop: LeafProp
  seeded: Array<{ path: string; value: unknown }>
  allowed: string[]
}

/** `common.general.loading`, or `navigation.about_meditation` for a flat tab. */
function seedPath(groupField: string | null, fieldName: string, innerKey: string): string {
  return [groupField, fieldName, innerKey].filter((part) => part !== null).join('.')
}

function readSeed(groupField: string | null, fieldName: string, innerKey: string): unknown {
  const container = groupField === null ? seed : (seed[groupField] as Record<string, unknown>)
  const leaf = container?.[fieldName]
  if (leaf === null || typeof leaf !== 'object') return undefined
  return (leaf as Record<string, unknown>)[innerKey]
}

function declaredKeys(): DeclaredKey[] {
  const out: DeclaredKey[] = []
  for (const [tabSlug, tabNode] of Object.entries(schema.properties)) {
    // `expandPlurals: false` — one entry per DECLARED key, so each expectation
    // is stated once per key rather than once per form.
    for (const lookup of collectLeafLookups(tabSlug, tabNode)) {
      const { groupField, fieldName, innerKey } = lookup
      if (innerKey === null) continue
      // A flat tab's keys hang off the tab node. A nested tab's hang off the
      // sub-group node, which `fieldName` names.
      const source =
        groupField === null
          ? tabNode
          : ((tabNode.properties ?? {})[fieldName] as SchemaNode | undefined)
      const prop = (source?.properties ?? {})[innerKey] as LeafProp | undefined
      if (!prop || prop.type !== 'string') continue

      const seededKeys =
        prop.plural === true
          ? ENGLISH_PLURAL_CATEGORIES.map((category) => `${innerKey}_${category}`)
          : [innerKey]

      out.push({
        prop,
        seeded: seededKeys.map((storageKey) => ({
          path: seedPath(groupField, fieldName, storageKey),
          value: readSeed(groupField, fieldName, storageKey),
        })),
        allowed: (prop.plural === true ? pluralStorageKeys(innerKey) : [innerKey]).map(
          (storageKey) => seedPath(groupField, fieldName, storageKey),
        ),
      })
    }
  }
  return out
}

/**
 * Each `node_*` key as `[slug, declared English]`, through the walker this
 * file's header names rather than a second reading of the nesting rules.
 * `englishDefault` is the walker's own extraction, so a plural key cannot
 * smuggle a value past it.
 */
function nodeKeys(): Array<[string, string | undefined]> {
  return collectLeafLookups('meditation', schema.properties.meditation)
    .filter((lookup) => lookup.fieldName === 'general' && lookup.innerKey?.startsWith('node_'))
    .map((lookup) => [(lookup.innerKey as string).slice('node_'.length), lookup.englishDefault])
}

describe('seeds/wm-web-translations/data.en.json', () => {
  const keys = declaredKeys()

  it('declares at least one key (the walker found the schema)', () => {
    // A walker that silently returned nothing would make every assertion
    // below pass over an empty list.
    expect(keys.length).toBeGreaterThan(50)
  })

  // Collected rather than one case per key: a single failure then names every
  // missing path at once, instead of the first of 140.
  it('covers every key the schema declares, bar the ones declaring their own', () => {
    const missing = keys
      .filter((entry) => entry.prop.default === undefined)
      .flatMap((entry) => entry.seeded)
      .filter((entry) => typeof entry.value !== 'string')
      .map((entry) => entry.path)
    expect(missing).toEqual([])
  })

  // One home per key. A `default` in `translationsSchema.json` is what reaches
  // a database that predates the key, and a second copy here would be free to
  // disagree with it — in the file the admin and the seed actually write from.
  it('leaves a key declaring a schema default out of the corpus', () => {
    const duplicated = keys
      .filter((entry) => entry.prop.default !== undefined)
      .flatMap((entry) => entry.seeded)
      .filter((entry) => entry.value !== undefined)
      .map((entry) => entry.path)
    expect(duplicated).toEqual([])
  })

  it('carries no key the schema does not declare', () => {
    const allowed = new Set(keys.flatMap((entry) => entry.allowed))

    const present: string[] = []
    for (const [topKey, topValue] of Object.entries(seed)) {
      if (topKey === '_meta') continue
      if (topValue === null || typeof topValue !== 'object') continue
      for (const [innerKey, innerValue] of Object.entries(topValue as Record<string, unknown>)) {
        if (innerValue !== null && typeof innerValue === 'object') {
          // Nested tab: <tab>.<sub-group>.<key>
          for (const leafKey of Object.keys(innerValue as Record<string, unknown>)) {
            present.push(`${topKey}.${innerKey}.${leafKey}`)
          }
        } else {
          // Flat tab: <tab>.<key>
          present.push(`${topKey}.${innerKey}`)
        }
      }
    }

    expect(present.filter((path) => !allowed.has(path))).toEqual([])
  })

  it('leaves no value blank', () => {
    const blank = keys
      .flatMap((entry) => entry.seeded)
      .filter(({ value }) => typeof value === 'string' && value.trim() === '')
      .map(({ path }) => path)
    expect(blank).toEqual([])
  })

  // A translator sees only the description. A placeholder the description
  // never mentions reads as literal text, and gets translated as such.
  it('names every placeholder it uses in that key’s description', () => {
    const unexplained: string[] = []
    for (const { prop, seeded } of keys) {
      const description = prop.description ?? ''
      for (const { path, value } of seeded) {
        if (typeof value !== 'string') continue
        for (const match of value.matchAll(/%\{(\w+)\}/g)) {
          if (!description.includes(`%{${match[1]}}`)) {
            unexplained.push(`${path} → %{${match[1]}}`)
          }
        }
      }
    }
    expect(unexplained).toEqual([])
  })

  // `strict` turns a limit into a save gate, measured on the RAW string —
  // `%{count}` included. Seeding a value the gate then refuses would make
  // `pnpm seed translations` fail on a fresh database.
  it('keeps every strict value inside its own limit', () => {
    const over: string[] = []
    for (const { prop, seeded } of keys) {
      if (prop.strict !== true || typeof prop.maxLength !== 'number') continue
      for (const { path, value } of seeded) {
        if (typeof value === 'string' && [...value].length > prop.maxLength) {
          over.push(`${path} (${[...value].length}/${prop.maxLength})`)
        }
      }
    }
    expect(over).toEqual([])
  })

  it('agrees with the storage family the field builder expands to', () => {
    // Guards the assumption the English-only expectations rest on: `one` and
    // `other` really are members of the family, so seeding them populates
    // real columns rather than keys nothing reads.
    for (const category of ENGLISH_PLURAL_CATEGORIES) {
      expect(PLURAL_CATEGORIES).toContain(category)
    }
    expect(pluralStorageKeys('classes_shown')).toContain('classes_shown_one')
    expect(pluralStorageKeys('classes_shown')).toContain('classes_shown_other')
  })

  /**
   * `article.general.tag_*` is one filter chip per `PAGE_TAGS` entry
   * (`src/lib/pageTags/index.ts`), which `Pages` and `ContentIndexBlock` both
   * read. The two lists are coupled and nothing joins them, so a sixth tag
   * would give pages a facet with no translatable label — and nothing would
   * fail, here or in WeMeditateWeb.
   */
  it('declares one article tag key per PAGE_TAGS entry', () => {
    const general = (schema.properties.article?.properties ?? {})['general'] as
      SchemaNode | undefined
    const declared = Object.keys(general?.properties ?? {})
      .filter((key) => key.startsWith('tag_'))
      .map((key) => key.slice('tag_'.length))

    expect([...declared].sort()).toEqual([...PAGE_TAGS].sort())
  })

  /**
   * `meditation.general.node_*` is one name per `SUBTLE_SYSTEM_NODE_OPTIONS`
   * entry, which `meditations.titleNode` answers from. Nothing joins the two
   * lists, so a thirteenth node would give a meditation a name `title` has no
   * translatable label for — and nothing would fail, here or in WeMeditateWeb.
   *
   * The `default` half is the same coupling: English is declared beside the key
   * rather than seeded, so it is the only copy a drifting label could pass.
   */
  it('declares one meditation node key per SUBTLE_SYSTEM_NODE_OPTIONS entry', () => {
    expect(Object.fromEntries(nodeKeys())).toEqual(
      Object.fromEntries(SUBTLE_SYSTEM_NODE_OPTIONS.map((option) => [option.value, option.label])),
    )
  })

  /**
   * `meditations.title` holds the finished English sentence and this group holds
   * the format string a site composes its own from. Both spell the wording, and
   * `reconcileEnglishDefaults` fills only an absent key — so a reword needs a
   * data migration, and until one runs the two copies are free to diverge for a
   * whole release with nothing failing.
   */
  it('composes the same English name the meditations hook does', () => {
    const general = (schema.properties.meditation?.properties ?? {})['general'] as
      SchemaNode | undefined
    const format = (general?.properties ?? {})['title'] as LeafProp | undefined

    expect(format?.default).toBeDefined()
    for (const [value, label] of nodeKeys()) {
      expect(meditationTitleFromWeights({ [value]: 1 })).toBe(
        format?.default?.replace('%{node}', String(label)),
      )
    }
  })
})
