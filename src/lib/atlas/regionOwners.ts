import type { CanonicalTarget } from './canonicalUrl'
import type { PayloadRequest } from 'payload'

import type { RoutingMode } from '@/lib/clients/canonical'
import { serverEnv } from '@/lib/env'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import { canonicalUrlBase } from './canonicalUrl'
import { getRegionTree } from './regionTree'

/**
 * Which client owns the canonical URLs for each region (#634).
 *
 * A client declares ownership of one region (`canonical.enabled` + `region` +
 * `canonical.embed`, enforced unique per region by
 * `validateCanonicalOwnership`). That ownership then covers the whole subtree
 * beneath it: a sub-region, and an event inside it, resolve to the same owner,
 * with the **nearest** ancestor winning over a more distant one — Greater
 * London under `sahajayogalondon.co.uk`, not `sahajayoga.org.uk`.
 *
 * **The host, mount and routing come from `canonical.verification.verified` —
 * never from the declaration itself.** `canonical.embed` only *nominates* one of
 * the mounts the widget reported, and the report endpoint is reachable by anyone
 * holding a published key from an allowed origin (#633). `verified` is written
 * solely by the verification job, from what it observed loading the page itself,
 * so a forged report can nominate a mount but can never reshape a public URL.
 * An enabled client whose embed has not yet verified therefore owns nothing and
 * falls through to the next ancestor.
 *
 * Loaded lazily and memoized separately from the region tree, so a read that
 * only wants `webPath` — the widget's geojson feed selects `webPath` and not
 * `webUrl` — still issues exactly one query and never looks at ownership.
 */

/** A client's canonical-URL declaration, flattened to what the builder needs. */
export interface CanonicalOwner {
  /** The owning client, so a resolution can be traced back to its record. */
  clientId: number
  /** Bare host — no scheme, no path. */
  domain: string
  /** The page the widget is mounted on. May carry a query string. */
  mount: string
  routing: RoutingMode
}

/** The `clients` row shape this resolver reads. */
interface ClientRow {
  id: number
  region?: unknown
  canonical?: {
    enabled?: boolean | null
    verification?: {
      verified?: {
        domain?: string | null
        mount?: string | null
        routing?: RoutingMode | null
      } | null
    } | null
  } | null
}

/** `req.context` key for the per-request ownership memo. */
const OWNERS_MEMO_KEY = 'atlas:regionOwners'

/**
 * The clients that directly own a region, keyed by that region's id.
 *
 * One extra query per request, ~31 rows, deliberately unoptimised: a
 * process-level cache would need invalidation across instances, and
 * denormalizing the owner onto 595 regions would need a sync hook that can
 * drift. Revisit only if the client count grows an order of magnitude.
 */
async function loadDirectOwners(req: PayloadRequest): Promise<Map<number, CanonicalOwner>> {
  const { docs } = await req.payload.find({
    collection: 'clients',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    where: {
      and: [
        { 'canonical.enabled': { equals: true } },
        // Clients have drafts, and a draft-only client has not been signed off
        // as canonical-viable. Explicit rather than relying on the default
        // `draft: false`, because this is a correctness rule, not a read mode.
        { _status: { equals: 'published' } },
      ],
    },
    select: { region: true, canonical: true },
    req,
  })

  const owners = new Map<number, CanonicalOwner>()
  // Ascending id, so if two enabled clients ever claim one region — the
  // uniqueness hook rejects it, but data can predate a hook — the winner is
  // stable across requests rather than dependent on row order.
  const rows = (docs as ClientRow[]).slice().sort((a, b) => a.id - b.id)

  for (const row of rows) {
    const regionId = relationId(row.region)
    const verified = row.canonical?.verification?.verified
    // An incomplete declaration owns nothing: without a region there is no
    // subtree to cover, and without a *verified* host there is no URL we are
    // willing to publish. Better to fall through to the next ancestor (or We
    // Meditate) than to emit a canonical URL pointing at a page we have never
    // confirmed actually runs the widget.
    if (regionId == null || !verified?.domain) continue
    if (owners.has(regionId)) continue

    owners.set(regionId, {
      clientId: row.id,
      domain: verified.domain,
      mount: verified.mount ?? '/',
      routing: verified.routing ?? 'query',
    })
  }
  return owners
}

/**
 * Resolve each region to its nearest owning ancestor.
 *
 * Walks every region's chain **self → root** and takes the first hit, so the
 * most specific declaration wins. One pass over the tree with a chain depth of
 * ≤ 4 (country → region → area → venue), so this stays O(n).
 *
 * Pure, and separate from the query above, so precedence is unit-testable
 * without a database.
 */
export function resolveOwnersByRegion(
  chainById: Map<number, number[]>,
  directOwners: Map<number, CanonicalOwner>,
): Map<number, CanonicalOwner> {
  const ownerById = new Map<number, CanonicalOwner>()
  if (directOwners.size === 0) return ownerById

  for (const [regionId, chain] of chainById) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const owner = directOwners.get(chain[i])
      if (owner) {
        ownerById.set(regionId, owner)
        break
      }
    }
  }
  return ownerById
}

async function loadRegionOwners(req: PayloadRequest): Promise<Map<number, CanonicalOwner>> {
  // The region tree is already memoized, so this is one `clients` query on top
  // of the one `regions` query a path read pays for — two in total, whatever
  // the number of documents being resolved.
  const [{ chainById }, directOwners] = await Promise.all([
    getRegionTree(req),
    loadDirectOwners(req),
  ])
  return resolveOwnersByRegion(chainById, directOwners)
}

/**
 * The canonical owner for every region, keyed by region id, resolved once per
 * request. A region with no owner anywhere in its ancestry is simply absent —
 * the caller falls back to the We Meditate surface.
 *
 * `memoizeOnRequest` stores the **promise**, not the resolved value: a bulk
 * read issues every document's afterRead concurrently, and a resolved-value
 * cache stampedes under that. It also evicts a failed load so a later read in
 * the same request can retry.
 */
function getRegionOwners(req: PayloadRequest): Promise<Map<number, CanonicalOwner>> {
  return memoizeOnRequest(req, OWNERS_MEMO_KEY, () => loadRegionOwners(req))
}

/**
 * The canonical target for a region: its owner's, or the We Meditate surface
 * when nothing in its ancestry is owned.
 *
 * The fallback routes by `path` — We Meditate mounts the widget on a real page
 * of its own (`/map`) rather than embedding it in someone else's — and is the
 * reason `SAHAJATLAS_URL` is no longer a canonical base anywhere: the Atlas host
 * is `noindex` on three layers, so every canonical URL it backed named a page we
 * had told search engines to ignore.
 */
export function canonicalTargetFor(owner: CanonicalOwner | undefined): CanonicalTarget {
  if (!owner) {
    return {
      origin: serverEnv.WEMEDITATE_WEB_URL,
      mount: serverEnv.WEMEDITATE_ATLAS_BASE_PATH,
      routing: 'path',
    }
  }
  // `canonical.domain` is a bare host by construction, and a canonical URL a
  // crawler should follow is https — so the scheme is ours to state, not the
  // operator's to mistype.
  return { origin: `https://${owner.domain}`, mount: owner.mount, routing: owner.routing }
}

/**
 * Resolve the `webUrl` base for a region — everything before the region path.
 *
 * The single entry point both collections' `publicUrlFields({ web })` use, so
 * an event and its region can't resolve to different owners. Returns `null`
 * when the owner's record can't make a valid URL, which reads the field as
 * `null` rather than emitting a broken one.
 */
export async function getCanonicalUrlBase(
  req: PayloadRequest,
  regionId: number | null,
): Promise<string | null> {
  const owner = regionId == null ? undefined : (await getRegionOwners(req)).get(regionId)
  return canonicalUrlBase(canonicalTargetFor(owner))
}
