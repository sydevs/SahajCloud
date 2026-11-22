/**
 * Which services a page belongs to — the website, the app, or both — read from
 * each service's own configuration global, never from the page itself.
 *
 * A page belongs to a service when that service's configuration names it in
 * any page field (the home page, a menu list, an app slot), or when the page
 * carries one of the tags that configuration lists under "Page tags". There is
 * no second publish control: an editor places a page by listing or tagging it,
 * and the page's sidebar says where it is placed and why.
 *
 * The page fields are read off the global's built config rather than listed
 * here, so a page field added to either configuration places its pages with no
 * change in this file. `docs/rules/access.md` carries the rule.
 */
import type { FlattenedField, PayloadRequest, Where } from 'payload'

import { toWords, valueIsValueWithRelation } from 'payload/shared'

import { isRecord } from '@/lib/utilities/isRecord'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Page } from '@/payload-types'

/**
 * Each service that places pages: its configuration global, the name of the
 * page's sidebar line answering for it, and the words that line and the
 * configuration's tag list use.
 */
export const PAGE_SERVICES = {
  web: {
    slug: 'wm-web-config',
    sidebarField: 'onWebsite',
    sidebarLabel: 'On the website',
    noun: 'website',
    notPlaced:
      'Not on the website. Name it in We Meditate Web › Configuration, or give it one of the page tags listed there.',
  },
  app: {
    slug: 'wm-app-config',
    sidebarField: 'inApp',
    sidebarLabel: 'In the app',
    noun: 'app',
    notPlaced:
      'Not in the app. Name it in We Meditate App › Configuration, or give it one of the page tags listed there.',
  },
} as const

export type PageService = keyof typeof PAGE_SERVICES

/** The name of the tag list on both configuration globals. */
export const SERVICE_PAGE_TAGS_FIELD = 'pageTags'

/** Every page one service's configuration places. */
export interface ServicePages {
  /** Page id → the label of each configuration field naming it. */
  named: ReadonlyMap<number, readonly string[]>
  /** The tags whose pages the service also takes. */
  tags: readonly string[]
}

/**
 * The pages one service places, derived at most once per request: a list read
 * fans the page's afterRead hooks out across every document, and the read
 * clause asks too (`memoizeOnRequest` says why the promise is what is kept).
 *
 * ⚠ **`req` keys the memo and is not forwarded.** The afterRead hooks also run
 * on a write's response while its transaction is open, and a nested read that
 * joins it takes the write down with it if it fails (`src/collections/AGENTS.md`).
 * The configuration is committed state, so its own connection is the right
 * one. The read runs on our authority, so no client `select` gate or usage
 * meter applies, and no access check can ask for this same promise.
 */
export function loadServicePages(req: PayloadRequest, service: PageService): Promise<ServicePages> {
  const { slug } = PAGE_SERVICES[service]
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
  const named = new Map<number, string[]>()
  const root = isRecord(data) ? data : null

  const add = (value: unknown, label: string) => {
    const id = pageId(value)
    if (id == null) return
    const labels = named.get(id) ?? []
    if (!labels.includes(label)) labels.push(label)
    named.set(id, labels)
  }

  const walk = (level: readonly FlattenedField[], value: unknown) => {
    if (!isRecord(value)) return
    for (const field of level) {
      const own = value[field.name]
      if (field.type === 'relationship' && namesPages(field.relationTo)) {
        // Payload labels every unlabelled field `toWords(name)` while it
        // sanitizes, so the fallback serves only an unsanitized field.
        const label = typeof field.label === 'string' ? field.label : toWords(field.name)
        for (const entry of Array.isArray(own) ? own : [own]) add(entry, label)
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

  walk(fields, root)

  const tags = root?.[SERVICE_PAGE_TAGS_FIELD]
  return {
    named,
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
  }
}

/**
 * Why a page belongs to a service: the configuration fields naming it, then
 * the listed tags it carries. Empty means it does not belong.
 */
export function pageServiceReasons(
  page: { id?: unknown; tags?: Page['tags'] },
  pages: ServicePages,
): string[] {
  const id = relationId(page.id)
  const reasons = [...((id != null && pages.named.get(id)) || [])]
  for (const tag of page.tags ?? []) {
    if (pages.tags.includes(tag)) reasons.push(`tagged "${tag}"`)
  }
  return reasons
}

/**
 * The same membership as a `Where`, for a read clause: a page one of the
 * configuration's fields names, or one carrying a listed tag.
 *
 * ⚠ **An unconfigured service matches nothing**, never everything — the
 * direction a missing configuration must fail, since the point of the clause
 * is that a page the website was not given never reaches it. `id` always
 * exists, so `exists: false` is the empty set without an empty `in` list,
 * whose SQL varies by adapter.
 */
export function servicePagesWhere(pages: ServicePages): Where {
  const clauses: Where[] = []
  if (pages.named.size) clauses.push({ id: { in: [...pages.named.keys()] } })
  if (pages.tags.length) clauses.push({ tags: { in: [...pages.tags] } })

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
