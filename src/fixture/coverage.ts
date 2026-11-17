import type { ViewRegistry } from './views'
import type { FlattenedField, SanitizedCollectionConfig } from 'payload'

import { SUBMISSION_MACHINE } from '@/collections/UserSubmissions/machine'
import { EVENT_MACHINE } from '@/lib/eventVerification/machine'

import { ID } from './ids'
import { FIXTURE_ID_FLOOR, type CollectionFixture } from './types'

/** Each collection holds at least this many rows, so a list shows variety. */
export const MIN_ENTRIES = 3

/**
 * Selects whose options are an open vocabulary — every timezone, locale,
 * language or country — rather than states or kinds a page renders
 * differently. Covering one would add rows and show nothing.
 */
const OPEN_VOCABULARIES: { test: (slug: string, path: string) => boolean; why: string }[] = [
  { test: (_s, path) => path.endsWith('_tz'), why: 'the IANA timezone list' },
  {
    test: (s, path) =>
      ['meditations.locale', 'lectures.subtitles.locale', 'files.spokenLanguage'].includes(
        `${s}.${path}`,
      ),
    why: 'the 19 site locales',
  },
  {
    test: (s, path) =>
      [
        'managers.language',
        'clients.language',
        'events.languages',
        'imports.defaultLanguages',
      ].includes(`${s}.${path}`),
    why: 'the ISO 639 language list',
  },
  { test: (s, path) => `${s}.${path}` === 'audiences.location.countries', why: 'every country' },
  {
    test: (s, path) => s === 'payload-jobs' && path.endsWith('taskSlug'),
    why: 'one value per registered task',
  },
]

const isOpenVocabulary = (slug: string, path: string): boolean =>
  OPEN_VOCABULARIES.some((v) => v.test(slug, path))

type Values = Map<string, Set<string>>

/** Record every select and radio value `data` holds, keyed by the field's dotted path. */
function collectValues(fields: FlattenedField[], data: unknown, prefix: string, out: Values): void {
  if (!data || typeof data !== 'object') return
  const row = data as Record<string, unknown>
  for (const field of fields) {
    if (!('name' in field)) continue
    const path = prefix ? `${prefix}.${field.name}` : field.name
    const value = row[field.name]
    if (field.type === 'select' || field.type === 'radio') {
      const set = out.get(path) ?? new Set<string>()
      for (const v of [value].flat()) if (v != null) set.add(String(v))
      out.set(path, set)
    } else if (field.type === 'array') {
      for (const item of Array.isArray(value) ? value : []) {
        collectValues(field.flattenedFields, item, path, out)
      }
    } else if (field.type === 'blocks') {
      for (const item of Array.isArray(value) ? value : []) {
        const block = field.blocks?.find(
          (b) => b.slug === (item as { blockType?: string })?.blockType,
        )
        if (block) collectValues(block.flattenedFields, item, `${path}[${block.slug}]`, out)
      }
    } else if ('flattenedFields' in field) {
      collectValues(field.flattenedFields, value, path, out)
    }
  }
}

/** Every select and radio a collection declares, with its options. */
function selectFields(
  fields: FlattenedField[],
  prefix: string,
): { path: string; options: string[] }[] {
  const found: { path: string; options: string[] }[] = []
  for (const field of fields) {
    if (!('name' in field)) continue
    const path = prefix ? `${prefix}.${field.name}` : field.name
    // A virtual select is computed on read, so no entry can set it.
    if ((field.type === 'select' || field.type === 'radio') && !field.virtual) {
      found.push({
        path,
        options: field.options.map((o) => (typeof o === 'string' ? o : o.value)),
      })
    } else if (field.type === 'blocks') {
      for (const block of field.blocks ?? []) {
        found.push(...selectFields(block.flattenedFields, `${path}[${block.slug}]`))
      }
    } else if ('flattenedFields' in field) {
      found.push(...selectFields(field.flattenedFields, path))
    }
  }
  return found
}

/** Every string anywhere in a value. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[a-z]{2,}/gi

/** The `collections/<slug>/<id>` a view link opens, if it opens one. */
const LINK_DOCUMENT = /\/collections\/([a-z-]+)\/(\d+)/

export interface CoverageInput {
  collections: SanitizedCollectionConfig[]
  fixtures: CollectionFixture[]
  /** Every custom admin component path in `importMap.js` (`@/…#export`). */
  components: string[]
  views: ViewRegistry
}

/**
 * What the fixture fails to show, one line per gap, each naming the collection,
 * state, option or view so a session can fix it from the CI log alone.
 */
export function fixtureGaps({ collections, fixtures, components, views }: CoverageInput): string[] {
  const gaps: string[] = []
  const bySlug = new Map(fixtures.map((f) => [f.slug, f]))
  const ids = new Map(fixtures.map((f) => [f.slug as string, new Set(f.entries.map((e) => e.id))]))

  for (const config of collections) {
    const fixture = bySlug.get(config.slug as never)
    if (!fixture) continue
    const { entries } = fixture

    if (entries.length < MIN_ENTRIES) {
      gaps.push(`${config.slug}: ${entries.length} entries, needs at least ${MIN_ENTRIES}`)
    }
    const seen = new Set<number>()
    for (const { id } of entries) {
      if (!Number.isInteger(id) || id < FIXTURE_ID_FLOOR) {
        gaps.push(`${config.slug}: id ${id} is below ${FIXTURE_ID_FLOOR}`)
      }
      if (seen.has(id)) gaps.push(`${config.slug}: id ${id} is used twice`)
      seen.add(id)
    }

    const values: Values = new Map()
    for (const entry of entries) {
      collectValues(config.flattenedFields, entry.data, '', values)
      for (const patch of Object.values(entry.locales ?? {})) {
        collectValues(config.flattenedFields, patch, '', values)
      }
      for (const text of strings([entry.data, entry.locales])) {
        for (const email of text.match(EMAIL) ?? []) {
          if (!email.toLowerCase().endsWith('.invalid')) {
            gaps.push(`${config.slug} ${entry.id}: email ${email} does not end in .invalid`)
          }
        }
      }
    }
    for (const { path, options } of selectFields(config.flattenedFields, '')) {
      if (isOpenVocabulary(config.slug, path)) continue
      const used = values.get(path) ?? new Set()
      for (const option of options) {
        if (!used.has(option)) gaps.push(`${config.slug}.${path}: no entry uses '${option}'`)
      }
    }
  }

  for (const machine of [EVENT_MACHINE, SUBMISSION_MACHINE]) {
    const slug = machine === EVENT_MACHINE ? 'events' : 'user-submissions'
    const used = new Set(
      bySlug.get(slug)?.entries.map((e) => (e.data as Record<string, unknown>)[machine.field]),
    )
    for (const state of machine.states) {
      if (!used.has(state)) gaps.push(`${machine.name}: no ${slug} entry at '${state}'`)
    }
  }

  for (const [group, anchors] of Object.entries(ID)) {
    const slug = group.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
    for (const [name, id] of Object.entries(anchors)) {
      if (!ids.get(slug)?.has(id))
        gaps.push(`ids.ts ${group}.${name}: no ${slug} entry has id ${id}`)
    }
  }

  for (const component of components) {
    if (!(component in views)) gaps.push(`view ${component}: missing from src/fixture/views.ts`)
  }
  for (const [component, view] of Object.entries(views)) {
    if (!components.includes(component)) {
      gaps.push(`view ${component}: in src/fixture/views.ts but not in importMap.js`)
    }
    if (!('links' in view)) continue
    for (const link of view.links) {
      const match = LINK_DOCUMENT.exec(link)
      if (match && !ids.get(match[1])?.has(Number(match[2]))) {
        gaps.push(`view ${component}: ${link} opens no fixture entry`)
      }
    }
  }

  return gaps
}
