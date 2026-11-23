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
 * The ancestor walk lives here because a page's path *is* its ancestry. The
 * `parent` validator reuses {@link pageAncestry} for the same reason: what it
 * must refuse is a chain this composer could not compose.
 */

/** Locales that take no path prefix: the default, and the all-locales read. */
const UNPREFIXED = new Set(['en', 'all'])

/**
 * How many ancestors a page may have.
 *
 * The content tree is section → page → subpage, so this is slack rather than a
 * limit anyone meets. It bounds the walk against a chain the `parent` validator
 * never saw — written before it existed, or straight into the database.
 */
export const PAGE_ANCESTOR_LIMIT = 5

/** One page in an ancestor chain: enough to compose a path and keep walking. */
export interface PageAncestor {
  id: number
  slug: string | null
  parent: number | null
}

/**
 * One ancestor row, on its own connection and memoized per request.
 *
 * ⚠ **`overrideAccess`, and `req` is not forwarded.** A page's address must not
 * depend on who reads it. A client's `pages` read is narrowed to the pages its
 * service configuration places, so an ancestor the configuration leaves out
 * reads as absent — and the walk would compose a truncated `path`, `webPath` and
 * `webUrl` for a child that *is* placed, with nothing erroring. The site would
 * then route and advertise that page at the wrong address, canonical, hreflang
 * and sitemap with it.
 *
 * Its own connection also keeps a failed read out of the caller's transaction,
 * which an `afterRead` decorating a write still shares
 * (`src/collections/AGENTS.md`).
 *
 * Only `slug` and `parent` are selected, so none of the ancestor's own computed
 * fields resolve and the walk cannot recurse back into itself.
 *
 * `trash: true` because a trashed row still holds its slug: trashing a section
 * must not silently move the address of every page beneath it.
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

/** Why an ancestor walk stopped before it reached a root. */
export type AncestryStop = 'depth' | 'loop' | 'missing'

/**
 * `pageId` and every page above it, nearest first.
 *
 * `stopped` is `null` when the walk reached a root, so the chain is the whole
 * ancestry and no longer than {@link PAGE_ANCESTOR_LIMIT}. Otherwise it says
 * which of the three broken shapes it found, because the two callers answer
 * them differently: the composer has no address for any of them, while the
 * `parent` validator refuses a loop and a too-deep chain and leaves a missing
 * row to Payload's own relationship validator.
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
 * The nested, unprefixed path a page is served at — `subtle-system/kundalini`.
 *
 * `''` for the home page, which is served at the site root and holds the slug
 * `''` by contract (`src/globals/AGENTS.md`). `null` where the page has no
 * address at all: no slug yet, or an ancestor chain that cannot be resolved —
 * an ancestor with no slug of its own would compose a `//`, and a malformed
 * address is worse than an absent one.
 */
export async function buildPagePath(opts: {
  slug: unknown
  parent: unknown
  req: PayloadRequest
}): Promise<string | null> {
  const { slug } = opts
  if (typeof slug !== 'string') return null
  // The site root, whatever it is nested under.
  if (slug === '') return ''

  const parentId = relationId(opts.parent)
  if (parentId === null) return slug

  const { chain, stopped } = await pageAncestry(parentId, opts.req)
  if (stopped !== null) return null

  const segments: string[] = []
  for (const ancestor of chain) {
    if (!ancestor.slug) return null
    segments.unshift(ancestor.slug)
  }
  segments.push(slug)

  return segments.join('/')
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
