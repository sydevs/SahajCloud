import type { Block, CollectionConfig, Field, GlobalConfig, Tab } from 'payload'

import {
  fieldAffectsData,
  fieldHasSubFields,
  flattenTopLevelFields,
  tabHasName,
} from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'
import { globals } from '@/globals'
import { pageBlocks } from '@/lib/richEditor/blocks'

/**
 * An `admin.condition` that reads a field its own level does not declare is
 * always false, so the field it guards never renders — and nothing fails.
 * `wisdomStyle` read the legacy EditorJS `position` for its whole life, and a
 * docs rewrite is the only reason anyone found it (#989).
 */

type ConditionSite = {
  where: string
  field: string
  scope: Set<string>
  /** The second parameter as transpiled, so a TS assertion around it is already erased. */
  parameter: string | undefined
  reads: string[]
}

/**
 * Measured 2026-10-20 over the real configs: 166 sites, 73 of them reading a
 * sibling. The floors sit below that to absorb a deleted field, and above the
 * vacuum a stopped walk would pass with.
 */
const MIN_CONDITION_SITES = 140
const MIN_SITES_READING_A_SIBLING = 60

const DOTTED_READ = /(?<![$\w])siblingData\s*\??\.\s*([A-Za-z_$][\w$]*)/g
const BRACKETED_READ = /(?<![$\w])siblingData\s*(?:\?\.)?\s*\[\s*(['"])([^'"]+)\1\s*\]/g
const SECOND_PARAMETER = /^[^(]*\(\s*[^,)]*,\s*([^,)]*)/

/**
 * Only `siblingData` names a sibling: `data` is the whole document and
 * `blockData` the enclosing block, which `LayoutBlock` reads deliberately.
 */
const siblingReadsOf = (source: string): string[] => {
  const names = new Set<string>()

  for (const [, name] of source.matchAll(DOTTED_READ)) names.add(name!)
  for (const [, , name] of source.matchAll(BRACKETED_READ)) names.add(name!)

  return [...names]
}

/**
 * `siblingData` is the data at the field's own level, so Payload's own
 * flattening answers which names that level declares: a `row`, a `collapsible`
 * and an unnamed `group` or `tab` hold no data, so their children belong to the
 * level above, while a named one contributes its own name and nothing inside it.
 *
 * `keepPresentationalFields` stays off: a `ui` field carries a name but no
 * data, so it never reaches `siblingData`, and admitting one would let this
 * spec pass the very shape it refuses.
 */
const scopeOf = (fields: Field[]): Set<string> =>
  new Set(
    flattenTopLevelFields(fields)
      .map((field) => field.name)
      .filter((name): name is string => Boolean(name)),
  )

const conditionSource = (node: Field | Tab): string | undefined => {
  const condition = 'admin' in node ? node.admin?.condition : undefined

  return typeof condition === 'function' ? String(condition) : undefined
}

const siteFor = (
  where: string,
  field: string,
  scope: Set<string>,
  source: string,
): ConditionSite => ({
  where,
  field,
  scope,
  parameter: SECOND_PARAMETER.exec(source)?.[1]?.trim(),
  reads: siblingReadsOf(source),
})

const collectSites = (
  fields: Field[],
  scope: Set<string>,
  where: string,
  sites: ConditionSite[],
) => {
  for (const field of fields) {
    const label = fieldAffectsData(field) ? field.name : field.type
    const source = conditionSource(field)

    if (source) sites.push(siteFor(where, label, scope, source))

    if (fieldHasSubFields(field)) {
      if (fieldAffectsData(field)) {
        collectSites(field.fields, scopeOf(field.fields), `${where} > ${label}`, sites)
      } else {
        collectSites(field.fields, scope, where, sites)
      }
    } else if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        // The tab itself sits on the parent's level, named or not.
        const tabSource = conditionSource(tab)
        const named = tabHasName(tab)

        if (tabSource) {
          sites.push(
            siteFor(where, `tab ${named ? tab.name : String(tab.label)}`, scope, tabSource),
          )
        }

        if (named) collectSites(tab.fields, scopeOf(tab.fields), `${where} > ${tab.name}`, sites)
        else collectSites(tab.fields, scope, where, sites)
      }
    } else if (field.type === 'blocks') {
      for (const block of field.blocks ?? []) {
        collectSites(block.fields, scopeOf(block.fields), `${where} > ${block.slug}`, sites)
      }
    }
  }
}

const allSites = (): ConditionSite[] => {
  const sites: ConditionSite[] = []
  const add = (where: string, fields: Field[]) =>
    collectSites(fields, scopeOf(fields), where, sites)

  for (const collection of collections as CollectionConfig[]) {
    add(`collections/${collection.slug}`, collection.fields)
  }
  for (const global of globals as GlobalConfig[]) add(`globals/${global.slug}`, global.fields)
  for (const block of pageBlocks as Block[]) add(`blocks/${block.slug}`, block.fields)

  return sites
}

/**
 * It runs over the real configs, which boot no Payload instance. A condition is
 * a closure, so its own source text is the only instrument: one that computes a
 * field name, or reads it through a helper, is invisible here. The two floors
 * and the parameter case below are what bound that — either the walk keeps
 * reaching what it claims to, or the lane goes red.
 */
describe('admin.condition reads a declared sibling', () => {
  const sites = allSites()

  it('names no field its own level does not declare', () => {
    const offenders = sites.flatMap((site) => {
      const idOf = (name: string) => `${site.where} :: ${site.field} :: ${name}`

      return site.reads
        .filter((name) => !site.scope.has(name))
        .map((name) => `${idOf(name)} — level declares: ${[...site.scope].join(', ')}`)
    })

    expect(offenders).toEqual([])
  })

  it('reaches the conditions the configs declare, and the siblings they read', () => {
    expect(sites.length).toBeGreaterThanOrEqual(MIN_CONDITION_SITES)
    expect(sites.filter((site) => site.reads.length > 0).length).toBeGreaterThanOrEqual(
      MIN_SITES_READING_A_SIBLING,
    )
  })

  it('reads each sibling where this spec can see it', () => {
    // A condition that renames the parameter, destructures it, or hands it to a
    // helper yields no read, so the case above would pass it on vacuum.
    const unreadable = sites
      .filter(({ parameter }) => parameter !== undefined && parameter !== '_siblingData')
      .filter(({ parameter, reads }) => parameter !== 'siblingData' || reads.length === 0)
      .map((site) => `${site.where} :: ${site.field} takes ${site.parameter}`)

    expect(unreadable).toEqual([])
  })
})
