/**
 * Which services a page belongs to — the website, the app, or both — read from
 * each service's own configuration global, never from the page itself.
 *
 * A page belongs to a service when that service's configuration names it in
 * any page field (the home page, a menu list, an app slot), or when the page
 * carries one of the tags that configuration lists under "Page tags". There is
 * no second publish control: an editor places a page by listing or tagging it.
 *
 * The page fields are read off the global's built config rather than listed
 * here, so a page field added to either configuration places its pages with no
 * change in this file. `docs/rules/access.md` carries the rule.
 */
import type { FlattenedField, GlobalSlug, PayloadRequest, Where } from 'payload'

import { valueIsValueWithRelation } from 'payload/shared'

import { isRecord } from '@/lib/utilities/isRecord'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Page } from '@/payload-types'

/** Each service that places pages, and the configuration global placing them. */
export const PAGE_SERVICE_GLOBALS = {
  web: 'wm-web-config',
  app: 'wm-app-config',
} as const satisfies Record<string, GlobalSlug>

export type PageService = keyof typeof PAGE_SERVICE_GLOBALS

/** The tag list both configuration globals declare, read by name here. */
export const SERVICE_PAGE_TAGS_FIELD = 'pageTags'

/** Every page one service's configuration places. */
export interface ServicePages {
  /** The pages its own page fields name. */
  ids: ReadonlySet<number>
  /** The tags whose pages it also takes. */
  tags: readonly string[]
}

/**
 * The pages one service places, derived at most once per request: a page's read
 * clause asks, and so does the sidebar table beside it
 * (`memoizeOnRequest` says why the promise is what is kept).
 *
 * ⚠ **`req` keys the memo and is not forwarded.** A page's afterRead hooks also
 * run on a write's response while its transaction is open, and a nested read
 * that joins it takes the write down with it if it fails
 * (`src/collections/AGENTS.md`). The configuration is committed state, so its
 * own connection is the right one. The read runs on our authority, so no client
 * `select` gate or usage meter applies, and no access check can ask for this
 * same promise.
 */
export function loadServicePages(req: PayloadRequest, service: PageService): Promise<ServicePages> {
  const slug = PAGE_SERVICE_GLOBALS[service]
  return memoizeOnRequest(req, `pageServices:${service}`, async () => {
    const data = await req.payload.findGlobal({ slug, depth: 0, overrideAccess: true })
    const fields = req.payload.config.globals.find((g) => g.slug === slug)?.flattenedFields ?? []
    return servicePagesFromConfig(fields, data)
  })
}

/**
 * Read a configuration document against its fields: every page a page field
 * names, and the tag list.
 *
 * Pure, so the walk is tested without a database. It descends into named
 * groups, named tabs, array rows and blocks; unnamed containers are already
 * flattened away by Payload.
 */
export function servicePagesFromConfig(
  fields: readonly FlattenedField[],
  data: unknown,
): ServicePages {
  const ids = new Set<number>()

  const walk = (level: readonly FlattenedField[], value: unknown) => {
    if (!isRecord(value)) return
    for (const field of level) {
      const own = value[field.name]
      if (field.type === 'relationship' && namesPages(field.relationTo)) {
        for (const entry of Array.isArray(own) ? own : [own]) {
          const id = pageId(entry)
          if (id != null) ids.add(id)
        }
      } else if (field.type === 'group' || field.type === 'tab') {
        walk(field.flattenedFields, own)
      } else if (field.type === 'array' && Array.isArray(own)) {
        for (const row of own) walk(field.flattenedFields, row)
      } else if (field.type === 'blocks' && Array.isArray(own)) {
        // shortcut: a block named by slug from `config.blocks` is not walked;
        // resolve `blockReferences` here once either configuration uses one.
        for (const row of own) {
          const block = isRecord(row) ? field.blocks.find((b) => b.slug === row.blockType) : null
          if (block) walk(block.flattenedFields, row)
        }
      }
    }
  }

  const root = isRecord(data) ? data : null
  walk(fields, root)

  const tags = root?.[SERVICE_PAGE_TAGS_FIELD]
  return {
    ids,
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
  }
}

/** How a service places a page: it names the page itself, or lists a tag the page carries. */
export type PagePlacement = { by: 'name' } | { by: 'tag'; tag: string }

/**
 * What places this page in a service, or `null` where nothing does.
 *
 * The sidebar table names it, so an editor reaches the one field or tag that
 * holds the page there rather than searching six page fields and a tag list.
 */
export function pagePlacement(
  page: { id?: unknown; tags?: Page['tags'] },
  pages: ServicePages,
): PagePlacement | null {
  const id = relationId(page.id)
  if (id != null && pages.ids.has(id)) return { by: 'name' }
  const tag = (page.tags ?? []).find((value) => pages.tags.includes(value))
  return tag ? { by: 'tag', tag } : null
}

/** Does a service place this page — by naming it, or by a tag it carries? */
export function isPagePlaced(
  page: { id?: unknown; tags?: Page['tags'] },
  pages: ServicePages,
): boolean {
  return pagePlacement(page, pages) !== null
}

/**
 * The same membership as a `Where`, for a read clause: a page any of these
 * services names, or one carrying a tag any of them lists. Taken together, so
 * a caller reading two services sends one id list and one tag list rather than
 * a clause each.
 *
 * ⚠ **Services placing nothing match nothing**, never everything — the
 * direction a missing configuration must fail, since the point of the clause
 * is that a page the website was not given never reaches it. `id` always
 * exists, so `exists: false` is the empty set without an empty `in` list,
 * whose SQL varies by adapter.
 */
export function servicePagesWhere(services: readonly ServicePages[]): Where {
  const ids = new Set(services.flatMap((pages) => [...pages.ids]))
  const tags = new Set(services.flatMap((pages) => pages.tags))

  const clauses: Where[] = []
  if (ids.size) clauses.push({ id: { in: [...ids] } })
  if (tags.size) clauses.push({ tags: { in: [...tags] } })

  if (!clauses.length) return { id: { exists: false } }
  return clauses.length === 1 ? clauses[0] : { or: clauses }
}

function namesPages(relationTo: string | string[]): boolean {
  return Array.isArray(relationTo) ? relationTo.includes('pages') : relationTo === 'pages'
}

/** A page field's value as a page id, polymorphic `{ relationTo, value }` included. */
function pageId(value: unknown): number | null {
  if (valueIsValueWithRelation(value)) {
    return value.relationTo === 'pages' ? relationId(value.value) : null
  }
  return relationId(value)
}
