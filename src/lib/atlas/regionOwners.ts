import type { CanonicalTarget } from './canonicalUrl'
import type { PayloadRequest } from 'payload'

import type { RoutingMode } from '@/lib/clients/canonical'
import { isValidCanonicalDomain } from '@/lib/clients/canonical'
import { serverEnv } from '@/lib/env'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import { canonicalTargetForHost, canonicalUrlBase } from './canonicalUrl'
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

/** `req.context` key for the per-request canonical-fallback memo. */
const FALLBACK_MEMO_KEY = 'atlas:canonicalFallbackOwner'

/**
 * Which clients may own a canonical, as `where` clauses.
 *
 * One definition, because both readers below apply it and a third condition
 * added to only one of them would let the fallback keep the old rule silently.
 * `_status` is explicit rather than left to the default `draft: false`: a
 * draft-only client has not been signed off as canonical-viable, which is a
 * correctness rule and not a read mode.
 */
const CANONICAL_ELIGIBLE = [
  { 'canonical.enabled': { equals: true } },
  { _status: { equals: 'published' } },
] as const

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
    where: { and: [...CANONICAL_ELIGIBLE] },
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
    // An incomplete declaration owns nothing: without a region there is no
    // subtree to cover, and without a *verified* host there is no URL we are
    // willing to publish. Better to fall through to the next ancestor (or We
    // Meditate) than to emit a canonical URL pointing at a page we have never
    // confirmed actually runs the widget.
    //
    // The host must also be a *bare* host, checked here rather than trusted:
    // the VerifyEmbeds job writes this column with a raw UPDATE, so the JSON
    // schema's domain rule never runs on that write (see `canonicalTargetForHost`).
    // Rejecting it at this point — before the ancestor walk, not after — is what
    // makes the next ancestor up win, rather than collapsing the whole subtree
    // to the We Meditate fallback because one client mid-chain is unusable.
    if (regionId == null) continue
    const owner = canonicalOwnerFrom(row)
    if (!owner || owners.has(regionId)) continue

    owners.set(regionId, owner)
  }
  return owners
}

/**
 * A `clients` row flattened to a {@link CanonicalOwner}, or `undefined` when it
 * cannot publish one.
 *
 * Shared by the subtree owners above and the canonical fallback below, so
 * "verified enough to name a public URL" means the identical thing in both
 * directions. The domain check is the load-bearing half — see the comment in
 * {@link loadDirectOwners} for why it is re-checked here rather than trusted.
 */
function canonicalOwnerFrom(row: ClientRow): CanonicalOwner | undefined {
  const verified = row.canonical?.verification?.verified
  if (!isValidCanonicalDomain(verified?.domain)) return undefined

  return {
    clientId: row.id,
    domain: verified.domain,
    mount: verified.mount ?? '/',
    routing: verified.routing ?? 'query',
  }
}

/**
 * The client that owns every region no other client claims (#652), or
 * `undefined` when the fallback is still the env-var We Meditate surface.
 *
 * Named on `sy-atlas-config`, so making the fallback ownable is a content
 * decision rather than a deploy — and, because ownership then covers the whole
 * tree, those regions gain a sitemap to appear in. Two queries: the global, then
 * the row it names.
 *
 * **An override, never a replacement.** Unset, unpublished, not canonically
 * enabled, or with no verified host, this answers `undefined` and every caller
 * keeps the behaviour it had before the field existed.
 *
 * ⚠ **Must apply `CANONICAL_ELIGIBLE`, not `verified` alone.** `verified` is not
 * cleared when verification fails, so a client the job has given up on would
 * otherwise keep speaking for every unclaimed page in the atlas.
 *
 * ⚠ **Read lazily**, only where the answer can change one: `sy-atlas-config`
 * backs no other read on the `webUrl` path, and `webUrl` resolves on the
 * afterRead of every region and every event. {@link getCanonicalUrlBase} asks
 * only when the region has no owner of its own.
 *
 * The reasoning behind both is in `docs/architecture.md`.
 */
async function loadCanonicalFallbackOwner(
  req: PayloadRequest,
): Promise<CanonicalOwner | undefined> {
  const config = await req.payload.findGlobal({
    slug: 'sy-atlas-config',
    depth: 0,
    overrideAccess: true,
    req,
  })
  const clientId = relationId(config.canonicalFallbackClient)
  if (clientId == null) return undefined

  const { docs } = await req.payload.find({
    collection: 'clients',
    where: { and: [{ id: { equals: clientId } }, ...CANONICAL_ELIGIBLE] },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { canonical: true },
    req,
  })

  const row = docs[0] as ClientRow | undefined
  return row ? canonicalOwnerFrom(row) : undefined
}

/** The canonical fallback client for this request, resolved once. */
export function getCanonicalFallbackOwner(
  req: PayloadRequest,
): Promise<CanonicalOwner | undefined> {
  return memoizeOnRequest(req, FALLBACK_MEMO_KEY, () => loadCanonicalFallbackOwner(req))
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
 *
 * Exported because ownership is also read in the **other direction**: the
 * sitemap endpoint (#650) asks which regions one client owns, rather than which
 * client owns one region. Answering that from this map — rather than from a
 * client's own `canonical.region` — is what makes a nearer client's subtree drop
 * out of the ancestor's sitemap, exactly as it drops out of its canonical URLs.
 */
export function getRegionOwners(req: PayloadRequest): Promise<Map<number, CanonicalOwner>> {
  return memoizeOnRequest(req, OWNERS_MEMO_KEY, () => loadRegionOwners(req))
}

/**
 * The canonical target for an owner — its own, or the env-var We Meditate
 * surface when it has none it can publish.
 *
 * That last rung routes by `path`: We Meditate mounts the widget on a real page
 * of its own (`/map`) rather than embedding it in someone else's — and is the
 * reason `SAHAJATLAS_URL` is no longer a canonical base anywhere, the Atlas host
 * being `noindex` on three layers.
 *
 * **The #652 fallback client is passed here as the owner**, not alongside one.
 * It is the same `CanonicalOwner` shape a subtree owner has and takes the same
 * host check, so the two cannot disagree about what a publishable canonical
 * looks like; precedence is the caller's business, and
 * {@link getCanonicalUrlBase} settles it by not resolving the fallback at all
 * when the region has an owner.
 */
export function canonicalTargetFor(owner: CanonicalOwner | undefined): CanonicalTarget {
  // An owner whose verified host is not a bare host (a port survives
  // `allowedDomains`, which compares port-stripped hostnames) can't make a
  // canonical URL — see `canonicalTargetForHost`. Treat it as no owner rather
  // than publishing a host nobody chose.
  const owned = owner ? canonicalTargetForHost(owner) : null
  if (owned) return owned

  return {
    origin: serverEnv.WEMEDITATE_WEB_URL,
    mount: serverEnv.WEMEDITATE_ATLAS_BASE_PATH,
    routing: 'path',
  }
}

/**
 * Resolve the `webUrl` base for a region — everything before the region path.
 *
 * The single entry point both collections' `publicUrlFields({ web })` use, so
 * an event and its region can't resolve to different owners. Returns `null`
 * when the owner's record can't make a valid URL, which reads the field as
 * `null` rather than emitting a broken one.
 *
 * **The fallback read is deliberately after the early return.** An owned region
 * resolves on exactly the two queries it did before #652; only a region nothing
 * claims pays for the `sy-atlas-config` lookup, and then once per request.
 */
export async function getCanonicalUrlBase(
  req: PayloadRequest,
  regionId: number | null,
): Promise<string | null> {
  const owner = regionId == null ? undefined : (await getRegionOwners(req)).get(regionId)
  const owned = owner ? canonicalTargetForHost(owner) : null
  if (owned) return canonicalUrlBase(owned)

  return canonicalUrlBase(canonicalTargetFor(await getCanonicalFallbackOwner(req)))
}

/**
 * A region's full canonical URL — its owner's base plus its own web path — or
 * `null` when either half is missing.
 *
 * The same composition {@link getCanonicalUrlBase}'s callers perform inside
 * `publicUrlFields`, hoisted here so a caller that needs the URL of a region it
 * did **not** read (an ancestor named only by id, e.g. a breadcrumb rung)
 * doesn't re-derive it. Resolving per region rather than reusing the terminal
 * document's base is the whole point: ownership is per-subtree, so `/gb` and
 * `/gb/greater-london` legitimately live on different domains, and a breadcrumb
 * that assumed one base would link the ancestor to a page that does not exist.
 *
 * Costs no extra query — both halves are per-request memoized maps.
 */
export async function getCanonicalUrlForRegion(
  req: PayloadRequest,
  regionId: number,
): Promise<string | null> {
  const [base, { pathById }] = await Promise.all([
    getCanonicalUrlBase(req, regionId),
    getRegionTree(req),
  ])
  const path = pathById.get(regionId)
  return base === null || path === undefined ? null : `${base}${path}`
}
