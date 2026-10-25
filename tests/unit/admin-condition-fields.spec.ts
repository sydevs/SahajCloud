import type { Block, CollectionConfig, Field, GlobalConfig, Tab } from 'payload'

import {
  baseAccountLockFields,
  baseAPIKeyFields,
  baseAuthFields,
  baseEmailField,
  baseIDField,
  baseSessionsField,
  baseUsernameField,
  baseVerificationFields,
} from 'payload'
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
 * An `admin.condition` that reads a field no level declares is always false, so
 * the field it guards never renders — and nothing fails. `wisdomStyle` read the
 * legacy EditorJS `position` for its whole life, and a docs rewrite is the only
 * reason anyone found it (#989).
 *
 * All three parameters are checked, each against the level it names: `data` is
 * the document, `siblingData` the field's own level, `blockData` the enclosing
 * block (#1004).
 */

type ConditionSite = {
  where: string
  field: string
  /** The field's own level. */
  scope: Set<string>
  /** The document's root level, or undefined inside a page block — see below. */
  root: Set<string> | undefined
  /** The enclosing block's own level, or undefined outside a block. */
  block: Set<string> | undefined
  /** The parameters as transpiled, so a TS annotation around one is already erased. */
  parameters: string[]
  reads: Record<Parameter, string[]>
}

type Parameter = 'blockData' | 'data' | 'siblingData'

/**
 * Measured 2026-10-25 over the real configs: 166 sites, 73 reading a sibling,
 * 75 reading `data` and 2 reading `blockData`. The floors sit below that to
 * absorb a deleted field, and above the vacuum a stopped walk — or a matcher
 * that stopped matching — would pass with. `blockData` has only the two sites,
 * so its floor is exact.
 */
const MIN_CONDITION_SITES = 140
const MIN_SITES_READING_A_SIBLING = 60
const MIN_SITES_READING_DATA = 60
const MIN_SITES_READING_BLOCK_DATA = 2

const dottedRead = (parameter: Parameter) =>
  new RegExp(`(?<![$\\w])${parameter}\\s*\\??\\.\\s*(?<name>[A-Za-z_$][\\w$]*)`, 'g')

const bracketedRead = (parameter: Parameter) =>
  new RegExp(
    `(?<![$\\w])${parameter}\\s*(?:\\?\\.)?\\s*\\[\\s*(?<quote>['"])(?<name>[^'"]+)\\k<quote>\\s*\\]`,
    'g',
  )

const PARAMETERS = /^[^(]*\(([^)]*)\)/

/**
 * A dotted read of a nested path (`data.schedule?.recurrenceType`) yields its
 * first segment, which is a name of the level being read, so nothing here
 * resolves a path.
 */
const readsOf = (source: string, parameter: Parameter): string[] => {
  const names = new Set<string>()

  for (const match of source.matchAll(dottedRead(parameter))) names.add(match.groups!.name!)
  for (const match of source.matchAll(bracketedRead(parameter))) names.add(match.groups!.name!)

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

/**
 * Payload injects columns no entity declares, and a condition reads one:
 * `hideUntilCreated` reads `data.id` for 12 collections, which is the only
 * injected name any condition reads today. Which columns an entity gets is
 * decided by its own config, so this reads those switches rather than listing
 * collections — one that turns `upload`, `auth`, `trash` or drafts on needs no
 * edit here.
 *
 * The auth groups come off Payload's own exports. The upload and draft columns
 * have no public export to derive from (`uploads/getBaseFields.ts`,
 * `versions/baseFields.ts`), so they are named. Every auth group is admitted
 * whenever `auth` is set, rather than per `loginWithUsername` and `useAPIKey` —
 * wider than Payload injects, and free while no condition reads one.
 */
const AUTH_COLUMNS = (
  [
    ...baseAuthFields,
    ...baseAccountLockFields,
    ...baseAPIKeyFields,
    ...baseVerificationFields,
    baseEmailField,
    baseSessionsField,
    baseUsernameField,
  ] as Field[]
).flatMap((field) => (fieldAffectsData(field) ? [field.name] : []))

const UPLOAD_COLUMNS = [
  'filename',
  'mimeType',
  'filesize',
  'width',
  'height',
  'sizes',
  'url',
  'thumbnailURL',
  'focalX',
  'focalY',
]

const TIMESTAMP_COLUMNS = ['createdAt', 'updatedAt']

const hasDrafts = (versions: CollectionConfig['versions'] | GlobalConfig['versions']): boolean =>
  typeof versions === 'object' && Boolean(versions.drafts)

const collectionRootScope = (collection: CollectionConfig): Set<string> => {
  const injected = [baseIDField.name]

  if (collection.timestamps !== false) injected.push(...TIMESTAMP_COLUMNS)
  if (collection.trash) injected.push('deletedAt')
  if (collection.upload) injected.push(...UPLOAD_COLUMNS)
  if (collection.auth) injected.push(...AUTH_COLUMNS)
  if (hasDrafts(collection.versions)) injected.push('_status')

  return new Set([...scopeOf(collection.fields), ...injected])
}

const globalRootScope = (global: GlobalConfig): Set<string> => {
  const injected = [baseIDField.name, 'globalType', ...TIMESTAMP_COLUMNS]

  if (hasDrafts(global.versions)) injected.push('_status')

  return new Set([...scopeOf(global.fields), ...injected])
}

const conditionSource = (node: Field | Tab): string | undefined => {
  const condition = 'admin' in node ? node.admin?.condition : undefined

  return typeof condition === 'function' ? String(condition) : undefined
}

type Levels = {
  scope: Set<string>
  root: Set<string> | undefined
  block: Set<string> | undefined
}

const siteFor = (where: string, field: string, levels: Levels, source: string): ConditionSite => ({
  where,
  field,
  ...levels,
  parameters: (PARAMETERS.exec(source)?.[1] ?? '')
    .split(',')
    .map((parameter) => parameter.trim())
    .filter(Boolean),
  reads: {
    data: readsOf(source, 'data'),
    siblingData: readsOf(source, 'siblingData'),
    blockData: readsOf(source, 'blockData'),
  },
})

const collectSites = (fields: Field[], levels: Levels, where: string, sites: ConditionSite[]) => {
  const descend = (into: Field[], scope: Set<string>, label: string, block = levels.block) =>
    collectSites(into, { ...levels, scope, block }, label, sites)

  for (const field of fields) {
    const label = fieldAffectsData(field) ? field.name : field.type
    const source = conditionSource(field)

    if (source) sites.push(siteFor(where, label, levels, source))

    if (fieldHasSubFields(field)) {
      if (fieldAffectsData(field))
        descend(field.fields, scopeOf(field.fields), `${where} > ${label}`)
      else descend(field.fields, levels.scope, where)
    } else if (field.type === 'tabs') {
      for (const tab of field.tabs) {
        // The tab itself sits on the parent's level, named or not.
        const tabSource = conditionSource(tab)
        const named = tabHasName(tab)

        if (tabSource) {
          sites.push(
            siteFor(where, `tab ${named ? tab.name : String(tab.label)}`, levels, tabSource),
          )
        }

        if (named) descend(tab.fields, scopeOf(tab.fields), `${where} > ${tab.name}`)
        else descend(tab.fields, levels.scope, where)
      }
    } else if (field.type === 'blocks') {
      // A block starts its own level and is what `blockData` names from here down.
      for (const block of field.blocks ?? []) {
        const own = scopeOf(block.fields)

        descend(block.fields, own, `${where} > ${block.slug}`, own)
      }
    }
  }
}

const allSites = (): ConditionSite[] => {
  const sites: ConditionSite[] = []

  for (const collection of collections as CollectionConfig[]) {
    const root = collectionRootScope(collection)

    collectSites(
      collection.fields,
      { scope: scopeOf(collection.fields), root, block: undefined },
      `collections/${collection.slug}`,
      sites,
    )
  }

  for (const global of globals as GlobalConfig[]) {
    const root = globalRootScope(global)

    collectSites(
      global.fields,
      { scope: scopeOf(global.fields), root, block: undefined },
      `globals/${global.slug}`,
      sites,
    )
  }

  // A page block is shared by every collection whose richText carries it, so it
  // has no one document to be the root — `root` stays undefined and the `data`
  // case below skips these sites rather than guessing one. Their `siblingData`
  // and `blockData` reads are checked like any other.
  for (const block of pageBlocks as Block[]) {
    const own = scopeOf(block.fields)

    collectSites(
      block.fields,
      { scope: own, root: undefined, block: own },
      `blocks/${block.slug}`,
      sites,
    )
  }

  return sites
}

/**
 * It runs over the real configs, which boot no Payload instance. A condition is
 * a closure, so its own source text is the only instrument: one that computes a
 * field name, or reads it through a helper, is invisible here. The floors and
 * the parameter case below are what bound that — either the walk keeps reaching
 * what it claims to, or the lane goes red.
 */
describe('admin.condition reads a declared field', () => {
  const sites = allSites()

  const report = (site: ConditionSite, parameter: Parameter, name: string, declares: string) =>
    `${site.where} :: ${site.field} :: ${parameter}.${name} — ${declares}`

  const undeclared = (site: ConditionSite, parameter: Parameter, level: Set<string>) =>
    site.reads[parameter]
      .filter((name) => !level.has(name))
      .map((name) => report(site, parameter, name, `declares: ${[...level].join(', ')}`))

  it('names no sibling its own level does not declare', () => {
    expect(sites.flatMap((site) => undeclared(site, 'siblingData', site.scope))).toEqual([])
  })

  it('names no document field the root level does not declare', () => {
    // A page block has no one root, so its sites carry none and are skipped here.
    const offenders = sites.flatMap((site) =>
      site.root ? undeclared(site, 'data', site.root) : [],
    )

    expect(offenders).toEqual([])
  })

  it('names no block field the enclosing block does not declare', () => {
    // Outside a block Payload passes `blockData: undefined`, so such a read is
    // the same always-false defect and is reported rather than skipped.
    const offenders = sites.flatMap((site) =>
      site.block
        ? undeclared(site, 'blockData', site.block)
        : site.reads.blockData.map((name) => report(site, 'blockData', name, 'no enclosing block')),
    )

    expect(offenders).toEqual([])
  })

  it('reaches the conditions the configs declare, and the levels they read', () => {
    const reading = (parameter: Parameter) =>
      sites.filter((site) => site.reads[parameter].length > 0).length

    expect(sites.length).toBeGreaterThanOrEqual(MIN_CONDITION_SITES)
    expect(reading('siblingData')).toBeGreaterThanOrEqual(MIN_SITES_READING_A_SIBLING)
    expect(reading('data')).toBeGreaterThanOrEqual(MIN_SITES_READING_DATA)
    expect(reading('blockData')).toBeGreaterThanOrEqual(MIN_SITES_READING_BLOCK_DATA)
  })

  it('reads each level through a parameter this spec can see', () => {
    // A condition that renames a parameter, or hands it to a helper, yields no
    // read, so the cases above would pass it on vacuum. Three spellings bound
    // that. An `_`-prefixed name declares the condition reads nothing at that
    // level. A destructured parameter — `{ id }`, `{ blockData }` — can only
    // read what it names, and the parameter's own type annotation is what checks
    // those names (#1004), since no regex sees through the pattern. And a
    // parameter spelled `siblingData` that yields no read has handed the level to
    // a helper, where the annotation on the helper's own parameter takes over;
    // `data` does that deliberately in three places, so it is not asked.
    const unreadable = sites.flatMap(({ where, field, parameters, reads }) => {
      const spelled = (index: number, expected: Parameter) => {
        const parameter = parameters[index]

        if (parameter === undefined || parameter.startsWith('_') || parameter.startsWith('{')) {
          return []
        }

        return parameter === expected
          ? []
          : [`${where} :: ${field} takes ${parameter} as ${expected}`]
      }

      return [
        ...spelled(0, 'data'),
        ...spelled(1, 'siblingData'),
        ...spelled(2, 'blockData'),
        ...(parameters[1] === 'siblingData' && reads.siblingData.length === 0
          ? [`${where} :: ${field} names siblingData and reads none`]
          : []),
      ]
    })

    expect(unreadable).toEqual([])
  })
})
