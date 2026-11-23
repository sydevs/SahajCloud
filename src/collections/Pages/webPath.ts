import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/**
 * The one place a page's public path is composed.
 *
 * Three callers need the same answer and must never drift:
 *
 * - the `path` field, which publishes the unprefixed nested path,
 * - `publicUrlFields`, which publishes it as `webPath` / `webUrl`, and
 * - `admin.livePreview.url`, which points the preview panel at it.
 *
 * When those disagree the panel lands on a 404 while the published URL looks
 * fine, or the reverse — both silent. They disagreed once already: a tag
 * segment was emitted here that no site has ever served.
 *
 * ⚠ **The locale is a parameter, not read from `req`.** `publicUrlFields`
 * passes `req.locale`; `livePreview.url` receives its own `locale.code` and
 * must pass that. They are not reliably the same value, and a builder that
 * reached for `req.locale` itself would silently render English in the panel.
 *
 * The ancestor walk lives here because a page's path *is* its ancestry, and the
 * `parent` validator reuses {@link pageAncestry}: what it must refuse is a chain
 * this composer could not compose.
 */

/** Locales that take no path prefix: the default, and the all-locales read. */
const UNPREFIXED = new Set(['en', 'all'])

/**
 * How many pages a page may sit under.
 *
 * The content tree is section → page → subpage, so this is slack rather than a
 * limit anyone meets. The walk enforces it as well as the validator because the
 * two see different data: the validator judges one save, while the walk starts
 * from whatever `parent` the read hands it — and a draft read supplies an
 * autosaved one, which no validator saw (`pages` declares no `drafts.validate`,
 * so Payload skips validation on every draft save).
 */
export const PAGE_ANCESTOR_LIMIT = 5

/** One page in an ancestor chain: enough to compose a path and keep walking. */
interface PageAncestor {
  id: number
  slug: string | null
  parent: number | null
}

/** Why an ancestor walk stopped before it reached a root. */
type AncestryStop = 'depth' | 'loop' | 'missing'

/**
 * One ancestor row, on its own connection and memoized per request.
 *
 * ⚠ **`overrideAccess`, and `req` is not forwarded.** A page's address must not
 * depend on who reads it: a client's `pages` read is narrowed, so an ancestor it
 * may not read would compose a truncated address for a child it may. Its own
 * connection also keeps a failed read out of the caller's transaction, which an
 * `afterRead` decorating a write still shares (`src/collections/AGENTS.md`).
 *
 * Keyed on the id alone, which is sound only because `req` is not forwarded:
 * the nested read runs at the default locale, and `slug` is not localized.
 *
 * The narrow `select` is what stops the walk recursing back into itself.
 *
 * `trash: true` because a trashed row still holds its slug: trashing a section
 * must not move the address of every page beneath it.
 */
function loadAncestor(id: number, req: PayloadRequest): Promise<PageAncestor | null> {
  return memoizeOnRequest(req, `pages:ancestor:${id}`, async () => {
    const row = await req.payload.findByID({
      collection: 'pages',
      id,
      depth: 0,
      select: { slug: true, parent: true },
      overrideAccess: true,
      disableErrors: true,
      trash: true,
    })
    if (!row) return null
    return {
      id,
      slug: typeof row.slug === 'string' ? row.slug : null,
      parent: relationId(row.parent),
    }
  })
}

/**
 * `pageId` and every page above it, nearest first.
 *
 * `stopped` is `null` when the walk reached a root, so the chain is the whole
 * ancestry. Which broken shape it found otherwise matters because the callers
 * differ: the composer has no address for any of them, while the `parent`
 * validator names each in words an editor can act on.
 */
export async function pageAncestry(
  pageId: number,
  req: PayloadRequest,
): Promise<{ chain: PageAncestor[]; stopped: AncestryStop | null }> {
  const chain: PageAncestor[] = []
  const seen = new Set<number>()
  let next: number | null = pageId

  while (next !== null) {
    if (seen.has(next)) return { chain, stopped: 'loop' }
    // Before the push, so `stopped: null` means the chain really is within the
    // limit rather than one over it.
    if (chain.length >= PAGE_ANCESTOR_LIMIT) return { chain, stopped: 'depth' }
    seen.add(next)
    const row = await loadAncestor(next, req)
    if (!row) return { chain, stopped: 'missing' }
    chain.push(row)
    next = row.parent
  }

  return { chain, stopped: null }
}

/**
 * The slugs of `parentId` and its ancestors, root first — the segments every
 * page under it shares.
 *
 * Memoized because this is what collapses the work: three virtual fields ask
 * per document, and every page under one section asks the same question, so a
 * 500-page read composes one prefix per distinct parent rather than 1,500.
 *
 * `null` where the chain yields no address — an ancestor with no slug would
 * compose a `//`, and a malformed address is worse than an absent one.
 */
function ancestorPrefix(parentId: number, req: PayloadRequest): Promise<string | null> {
  return memoizeOnRequest(req, `pages:prefix:${parentId}`, async () => {
    const { chain, stopped } = await pageAncestry(parentId, req)
    if (stopped !== null) return null

    const segments: string[] = []
    for (const ancestor of chain) {
      if (!ancestor.slug) return null
      segments.unshift(ancestor.slug)
    }
    return segments.join('/')
  })
}

/**
 * The nested, unprefixed path a page is served at — `subtle-system/kundalini`.
 *
 * `''` for the home page, which is served at the site root and holds the slug
 * `''` by contract (`src/globals/AGENTS.md`); `parentField` refuses it a parent,
 * so the root has no ancestors to prefix it with. `null` where the page has no
 * address at all: no slug yet, or an ancestor chain that cannot be resolved.
 */
export async function buildPagePath(opts: {
  slug: unknown
  parent: unknown
  req: PayloadRequest
}): Promise<string | null> {
  const { slug } = opts
  if (typeof slug !== 'string') return null
  // The site root, whatever it is nested under. Both sides refuse the home page
  // a parent, so this is the floor under a row written past them rather than a
  // branch anyone reaches: a trailing empty segment is the malformed address
  // this composer exists to refuse.
  if (slug === '') return ''

  const parentId = relationId(opts.parent)
  if (parentId === null) return slug

  const prefix = await ancestorPrefix(parentId, opts.req)

  return prefix === null ? null : `${prefix}/${slug}`
}

/**
 * The locale-prefixed public path: `webPath`, `webUrl` and the preview panel.
 *
 * The home page keeps no web path — the site root is not a page address the
 * consumer routes to, and a `/de` with nothing after it is not one either.
 */
export async function buildPageWebPath(opts: {
  slug: unknown
  parent: unknown
  locale: string | null | undefined
  req: PayloadRequest
}): Promise<string | null> {
  const path = await buildPagePath(opts)
  if (!path) return null

  const prefix = opts.locale && !UNPREFIXED.has(opts.locale) ? opts.locale : null

  return [prefix, path].filter(Boolean).join('/')
}
