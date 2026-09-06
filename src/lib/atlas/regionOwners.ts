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
 * A client declares ownership of one region (`canonical.enabled`, `region`,
 * and `canonical.embed`, enforced unique per region by
 * `validateCanonicalOwnership`). That ownership then covers the whole
 * subtree beneath it. A sub-region, and an event inside it, resolve to the
 * same owner, with the **nearest** ancestor winning over a more distant
 * one: Greater London under `sahajayogalondon.co.uk`, not
 * `sahajayoga.org.uk`.
 *
 * **The host, mount, and routing come from `canonical.verification.verified`,
 * never from the declaration itself.** `canonical.embed` only *nominates*
 * one of the mounts the widget reported, and the report endpoint is
 * reachable by anyone holding a published key from an allowed origin
 * (#633). Only the verification job writes `verified`, from what it
 * observed loading the page itself, so a forged report can nominate a
 * mount, but can never reshape a public URL. An enabled client whose embed
 * has not yet verified therefore owns nothing, and falls through to the
 * next ancestor.
 *
 * This loads lazily, and memoizes separately from the region tree, so a
 * read that only wants `webPath` (the widget's geojson feed selects
 * `webPath`, not `webUrl`) still issues exactly one query, and never looks
 * at ownership.
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
 * One definition, because both readers below apply it, and a third
 * condition added to only one of them would silently let the fallback keep
 * the old rule. `_status` is explicit, rather than left to the default
 * `draft: false`. A draft-only client has not been signed off as
 * canonical-viable, which is a correctness rule, not a read mode.
 */
const CANONICAL_ELIGIBLE = [
  { 'canonical.enabled': { equals: true } },
  { _status: { equals: 'published' } },
] as const

/**
 * The clients that directly own a region, keyed by that region's id.
 *
 * One extra query per request, about 31 rows, deliberately unoptimized. A
 * process-level cache would need invalidation across instances, and
 * denormalizing the owner onto 595 regions would need a sync hook that can
 * drift. Revisit only if the client count grows by an order of magnitude.
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
  // Ascending id. If two enabled clients ever claim one region — the
  // uniqueness hook rejects that, but data can predate a hook — the winner
  // stays stable across requests, instead of depending on row order.
  const rows = (docs as ClientRow[]).slice().sort((a, b) => a.id - b.id)

  for (const row of rows) {
    const regionId = relationId(row.region)
    // An incomplete declaration owns nothing. Without a region there is no
    // subtree to cover, and without a *verified* host there is no URL we
    // are willing to publish. It is better to fall through to the next
    // ancestor (or We Meditate) than to emit a canonical URL that points at
    // a page we have never confirmed actually runs the widget.
    //
    // The host must also be a *bare* host, checked here rather than
    // trusted. The VerifyEmbeds job writes this column with a raw UPDATE,
    // so the JSON schema's domain rule never runs on that write (see
    // `canonicalTargetForHost`). Rejecting it at this point, before the
    // ancestor walk rather than after, is what makes the next ancestor up
    // win, instead of collapsing the whole subtree to the We Meditate
    // fallback because one client mid-chain is unusable.
    if (regionId == null) continue
    const owner = canonicalOwnerFrom(row)
    if (!owner || owners.has(regionId)) continue

    owners.set(regionId, owner)
  }
  return owners
}

/**
 * A `clients` row flattened to a {@link CanonicalOwner}, or `undefined` when
 * it cannot publish one.
 *
 * The subtree owners above and the canonical fallback below share this, so
 * "verified enough to name a public URL" means the identical thing in both
 * directions. The domain check is the load-bearing half. See the comment
 * in {@link loadDirectOwners} for why this re-checks it, rather than
 * trusting it.
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
 * This is named on `sy-atlas-config`, so making the fallback ownable is a
 * content decision, not a deploy. Because ownership then covers the whole
 * tree, those regions also gain a sitemap to appear in. Two queries: the
 * global, then the row it names.
 *
 * **An override, never a replacement.** When unset, unpublished, not
 * canonically enabled, or with no verified host, this answers `undefined`,
 * and every caller keeps the behavior it had before the field existed.
 *
 * ⚠ **Apply `CANONICAL_ELIGIBLE`, not `verified` alone.** Verification
 * failure does not clear `verified`, so a client the job has given up on
 * would otherwise keep speaking for every unclaimed page in the atlas.
 *
 * ⚠ **Read lazily**, only where the answer can change one thing.
 * `sy-atlas-config` backs no other read on the `webUrl` path, and `webUrl`
 * resolves on the afterRead of every region and every event.
 * {@link getCanonicalUrlBase} asks only when the region has no owner of
 * its own.
 *
 * The reasoning behind both points is in `docs/architecture.md`.
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
 * This walks every region's chain from self to root, and takes the first
 * hit, so the most specific declaration wins. One pass over the tree, with
 * a chain depth of 4 or fewer (country, region, area, venue), so this stays O(n).
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
  // The region tree is already memoized, so this is one `clients` query on
  // top of the one `regions` query a path read pays for — two in total,
  // whatever the number of documents being resolved.
  const [{ chainById }, directOwners] = await Promise.all([
    getRegionTree(req),
    loadDirectOwners(req),
  ])
  return resolveOwnersByRegion(chainById, directOwners)
}

/**
 * The canonical owner for every region, keyed by region id, resolved once
 * per request. A region with no owner anywhere in its ancestry is simply
 * absent, and the caller falls back to the We Meditate surface.
 *
 * `memoizeOnRequest` stores the **promise**, not the resolved value. A bulk
 * read issues every document's afterRead concurrently, and a resolved-value
 * cache would stampede under that. It also evicts a failed load, so a
 * later read in the same request can retry.
 *
 * This is exported because ownership is also read in the **other
 * direction**. The sitemap endpoint (#650) asks which regions one client
 * owns, rather than which client owns one region. Answering that from this
 * map, rather than from a client's own `canonical.region`, is what makes a
 * nearer client's subtree drop out of the ancestor's sitemap, exactly as it
 * drops out of its canonical URLs.
 */
export function getRegionOwners(req: PayloadRequest): Promise<Map<number, CanonicalOwner>> {
  return memoizeOnRequest(req, OWNERS_MEMO_KEY, () => loadRegionOwners(req))
}

/**
 * The canonical target for an owner: its own, or the env-var We Meditate
 * surface when it has none it can publish.
 *
 * That last rung routes by `path`. We Meditate mounts the widget on a real
 * page of its own (`/map`), rather than embedding it in someone else's.
 * That is also why `SAHAJATLAS_URL` is no longer a canonical base anywhere:
 * the Atlas host is `noindex` on three layers.
 *
 * **The #652 fallback client is passed here as the owner**, not alongside
 * one. It is the same `CanonicalOwner` shape a subtree owner has, and it
 * takes the same host check, so the two cannot disagree about what a
 * publishable canonical looks like. Precedence is the caller's business.
 * {@link getCanonicalUrlBase} settles it by not resolving the fallback at
 * all when the region has an owner.
 */
export function canonicalTargetFor(owner: CanonicalOwner | undefined): CanonicalTarget {
  // An owner whose verified host is not a bare host cannot make a
  // canonical URL — see `canonicalTargetForHost`. (A port survives
  // `allowedDomains`, which compares port-stripped hostnames.) Treat this
  // as no owner, rather than publishing a host nobody chose.
  const owned = owner ? canonicalTargetForHost(owner) : null
  if (owned) return owned

  return {
    origin: serverEnv.WEMEDITATE_WEB_URL,
    mount: serverEnv.WEMEDITATE_ATLAS_BASE_PATH,
    routing: 'path',
  }
}

/**
 * Resolve the `webUrl` base for a region: everything before the region path.
 *
 * Both collections' `publicUrlFields({ web })` use this single entry
 * point, so an event and its region cannot resolve to different owners.
 * This returns `null` when the owner's record cannot make a valid URL,
 * which reads the field as `null`, rather than emitting a broken one.
 *
 * **The fallback read is deliberately after the early return.** An owned
 * region resolves on exactly the two queries it did before #652. Only a
 * region nothing claims pays for the `sy-atlas-config` lookup, and then
 * only once per request.
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
 * A region's full canonical URL: its owner's base plus its own web path, or
 * `null` when either half is missing.
 *
 * This is the same composition that {@link getCanonicalUrlBase}'s callers
 * perform inside `publicUrlFields`, hoisted here so a caller that needs the
 * URL of a region it did **not** read (an ancestor named only by id, for
 * example a breadcrumb rung) does not have to re-derive it. Resolving per
 * region, rather than reusing the terminal document's base, is the whole
 * point: ownership is per-subtree, so `/gb` and `/gb/greater-london`
 * legitimately live on different domains, and a breadcrumb that assumed
 * one base would link the ancestor to a page that does not exist.
 *
 * This costs no extra query. Both halves are per-request memoized maps.
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
