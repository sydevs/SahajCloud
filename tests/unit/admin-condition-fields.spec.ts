import type { Block, CollectionConfig, GlobalConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'
import { globals } from '@/globals'
import { pageBlocks } from '@/lib/richEditor/blocks'

/**
 * An `admin.condition` that reads a field its own level does not declare is
 * always false, so the field it guards never renders — and nothing fails.
 * `wisdomStyle` read the legacy EditorJS `position` for its whole life, and a
 * docs rewrite is the only reason anyone found it (#989).
 *
 * It runs over the **real** configs, not a fixture: a fixture would assume the
 * field sets under test. The three imports boot no Payload instance, as
 * `upload-notice-coverage.spec.ts` already relies on for `collections`.
 *
 * A condition's own source text is the only available instrument — a condition
 * is a closure, and nothing but its text says which field it reads. So one that
 * computes a field name, or reads it through a helper, is invisible here. That
 * is the limit the floors and the parameter-spelling case below bound: either
 * the walk keeps reaching what it claims to, or the lane goes red.
 */

/** Payload's `Field` union says `fields`/`tabs`/`blocks` exist on some members only; the walk is structural. */
type FieldLike = {
  type: string
  name?: string
  fields?: FieldLike[]
  tabs?: TabLike[]
  blocks?: { slug: string; fields: FieldLike[] }[]
  admin?: { condition?: unknown }
}

type TabLike = {
  name?: string
  label?: unknown
  fields?: FieldLike[]
  admin?: { condition?: unknown }
}

type ConditionSite = {
  where: string
  field: string
  scope: Set<string>
  source: string
}

/**
 * Measured 2026-10-20 over the real configs: 166 sites, 73 of them reading a
 * sibling. The floors sit below that to absorb a deleted field, and above the
 * vacuum a stopped walk would pass with.
 */
const MIN_CONDITION_SITES = 140
const MIN_SITES_READING_A_SIBLING = 60

/**
 * `siblingData` is the data at the field's own level, so a presentational
 * wrapper holds no data of its own and its children are siblings of its
 * parent's — the same hoisting `flattenTopLevelFields` does for one level.
 */
const isPresentational = (field: FieldLike) =>
  field.type === 'row' || field.type === 'collapsible' || (field.type === 'group' && !field.name)

/** The names one data level declares, hoisted out of the wrappers that hold no data. */
const scopeOf = (fields: FieldLike[]): Set<string> => {
  const names = new Set<string>()

  for (const field of fields) {
    if (isPresentational(field)) {
      for (const name of scopeOf(field.fields ?? [])) names.add(name)
    } else if (field.type === 'tabs') {
      // A named tab stores its own data under that name on this level; an
      // unnamed one stores nothing, so its fields belong to this level.
      for (const tab of field.tabs ?? []) {
        if (tab.name) names.add(tab.name)
        else for (const name of scopeOf(tab.fields ?? [])) names.add(name)
      }
    } else if (field.name) {
      names.add(field.name)
    }
  }

  return names
}

const collectSites = (
  fields: FieldLike[],
  scope: Set<string>,
  where: string,
  sites: ConditionSite[],
) => {
  for (const field of fields) {
    const label = field.name ?? field.type

    if (typeof field.admin?.condition === 'function') {
      sites.push({ where, field: label, scope, source: String(field.admin.condition) })
    }

    if (isPresentational(field)) {
      collectSites(field.fields ?? [], scope, where, sites)
    } else if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) {
        const tabFields = tab.fields ?? []
        // The tab itself sits on the parent's level, whether or not it is named.
        if (typeof tab.admin?.condition === 'function') {
          sites.push({
            where,
            field: `tab ${tab.name ?? String(tab.label)}`,
            scope,
            source: String(tab.admin.condition),
          })
        }
        if (tab.name) collectSites(tabFields, scopeOf(tabFields), `${where} > ${tab.name}`, sites)
        else collectSites(tabFields, scope, where, sites)
      }
    } else if (field.blocks) {
      for (const block of field.blocks) {
        collectSites(block.fields, scopeOf(block.fields), `${where} > ${block.slug}`, sites)
      }
    } else if (field.fields) {
      collectSites(field.fields, scopeOf(field.fields), `${where} > ${label}`, sites)
    }
  }
}

const DOTTED_READ = /(?<![$\w])siblingData\s*\??\.\s*([A-Za-z_$][\w$]*)/g
const BRACKETED_READ = /(?<![$\w])siblingData\s*(?:\?\.)?\s*\[\s*(['"])([^'"]+)\1\s*\]/g
const SECOND_PARAMETER = /^[^(]*\(\s*[^,)]*,\s*([^,)]*)/

/**
 * `data` is the whole document and `blockData` is the enclosing block, so
 * neither names a sibling — `LayoutBlock` reads `blockData.style` correctly.
 * A condition naming no field at all needs no allowlist: there is nothing to
 * check, which is what makes this cheaper than a pinned map of spellings.
 */
const siblingReadsOf = (source: string): string[] => {
  const names = new Set<string>()

  for (const [, name] of source.matchAll(DOTTED_READ)) names.add(name!)
  for (const [, , name] of source.matchAll(BRACKETED_READ)) names.add(name!)

  return [...names]
}

/**
 * The one condition in the repo that reads a field its level does not declare.
 * Its fix is PR #996, open on #989 with a question of its own; the behaviour is
 * the reviewer's to settle, not a test's. Delete this entry once that PR lands.
 * It is a backlog, not an approval, and may only shrink.
 */
const KNOWN_UNDECLARED = new Set<string>(['blocks/textbox :: wisdomStyle :: position'])

const allSites = (): ConditionSite[] => {
  const sites: ConditionSite[] = []

  for (const collection of collections as CollectionConfig[]) {
    const fields = collection.fields as FieldLike[]
    collectSites(fields, scopeOf(fields), `collections/${collection.slug}`, sites)
  }
  for (const global of globals as GlobalConfig[]) {
    const fields = global.fields as FieldLike[]
    collectSites(fields, scopeOf(fields), `globals/${global.slug}`, sites)
  }
  for (const block of pageBlocks as Block[]) {
    const fields = block.fields as FieldLike[]
    collectSites(fields, scopeOf(fields), `blocks/${block.slug}`, sites)
  }

  return sites
}

describe('admin.condition reads a declared sibling', () => {
  const sites = allSites()

  it('names no field its own level does not declare', () => {
    const offenders = sites.flatMap((site) =>
      siblingReadsOf(site.source)
        .filter((name) => !site.scope.has(name))
        .map((name) => ({
          id: `${site.where} :: ${site.field} :: ${name}`,
          scope: [...site.scope].join(', '),
        }))
        .filter((offender) => !KNOWN_UNDECLARED.has(offender.id))
        .map((offender) => `${offender.id} — level declares: ${offender.scope}`),
    )

    // The field this guards never renders. Read the level's own names above:
    // the condition means one of them, or it belongs on another level.
    expect(offenders).toEqual([])
  })

  it('reaches the conditions the configs declare, and the siblings they read', () => {
    const reading = sites.filter((site) => siblingReadsOf(site.source).length > 0)

    expect(sites.length).toBeGreaterThanOrEqual(MIN_CONDITION_SITES)
    expect(reading.length).toBeGreaterThanOrEqual(MIN_SITES_READING_A_SIBLING)
  })

  it('takes every sibling read through a parameter spelled siblingData', () => {
    // A condition destructuring the parameter, or renaming it, reads siblings
    // this spec cannot see — so the check above would pass it on vacuum.
    const renamed = sites
      .map((site) => ({ site, parameter: SECOND_PARAMETER.exec(site.source)?.[1]?.trim() }))
      .filter(({ parameter }) => parameter && parameter !== 'siblingData' && parameter !== '_siblingData')
      .map(({ site, parameter }) => `${site.where} :: ${site.field} takes ${parameter}`)

    expect(renamed).toEqual([])
  })
})
