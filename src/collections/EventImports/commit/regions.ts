/**
 * The commit's first step: every proposed region the batch needs, written or
 * found.
 *
 * ⚠ **Idempotent through `Regions.mapboxId`, not through stored ids.** Nothing
 * records which regions a commit created, because it does not have to:
 * `plannedMapboxId` is a function of the tree and the batch id, both stable
 * across attempts, and that column is unique. So a re-fired commit reads the
 * regions already carrying those ids and adopts them, and the tree the reviewer
 * approved is never rewritten. (`commit/regionData.ts` carries the seeding
 * rule.)
 *
 * ⚠ **Adopted only from inside the target, at the node's own level.** A region
 * holding the planned id may have been created since the review somewhere else
 * in the Atlas — by an admin, or by another volunteer's batch into a different
 * region. Adopting that one filed this batch's classes outside the region it was
 * aimed at. The same holds for a node the review matched to an existing region:
 * one moved out of the target since is refused, not followed.
 *
 * ⚠ **A slug or a feature taken since the review is recovered, not reported.**
 * The slug the review assigned is re-checked against the collection and
 * re-disambiguated; a unique `mapboxId` lost to a concurrent writer is re-read
 * and adopted under the same rule as above. Failing the node instead would fail
 * every row in it, on a batch that can no longer be proposed again.
 *
 * ⚠ **Only a write the database refused for the node's own data is a node
 * failure.** Anything else — a dropped connection, a deadlock — is thrown, so
 * the commit stops and the next call retries, rather than turning a moment of
 * trouble into rows the batch then deletes.
 */

import type { ProposedNode } from '../propose/tree'
import type { SubtreeRegion } from '../regionReads'
import type { PayloadRequest } from 'payload'

import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { Region } from '@/payload-types'

import { readTakenSlugs } from '../regionReads'
import { creatableNodes, matchedRegionIds, parentRegionId } from './placement'
import { plannedMapboxId, regionCreateData } from './regionData'
import { commitWriteReq } from './scope'

export interface EnsuredRegions {
  /** Every node's region, the ones the Atlas already held included. */
  known: Map<string, number>
  /** Node key mapped to why it has no region, for the rows it holds to report. */
  failures: Map<string, string>
  created: number
  /** Regions an earlier attempt of this same commit had already created. */
  adopted: number
}

export interface EnsureRegionsArgs {
  batchId: number
  /** Where a node with no proposed parent hangs. */
  targetId: number
  nodes: readonly ProposedNode[]
  /** Every region at or beneath the target, read for this request. */
  subtree: ReadonlyMap<number, SubtreeRegion>
}

export async function ensureProposedRegions(
  req: PayloadRequest,
  { batchId, targetId, nodes, subtree }: EnsureRegionsArgs,
): Promise<EnsuredRegions> {
  const known = matchedRegionIds(nodes)
  const failures = new Map<string, string>()

  for (const node of nodes) {
    if (node.match.kind !== 'existing' || subtree.has(node.match.regionId)) continue
    known.delete(node.key)
    failures.set(node.key, `${node.match.name} is no longer inside the region you are importing into`)
  }

  // Throws on a tree that is not parent-first, which is a refusal rather than a
  // failure — see `creatableNodes`.
  const creatable = creatableNodes(nodes)
  if (!creatable.length) return { known, failures, created: 0, adopted: 0 }

  const planned = new Map<string, string>()
  for (const node of creatable) {
    const mapboxId = plannedMapboxId(node, batchId)
    if (mapboxId) planned.set(node.key, mapboxId)
    else failures.set(node.key, 'it has no location to create it at')
  }

  const [held, takenSlugs] = await Promise.all([
    regionsHolding(req, [...new Set(planned.values())]),
    readTakenSlugs(req),
  ])
  const taken = new Set(takenSlugs)
  let created = 0
  let adopted = 0

  for (const node of creatable) {
    const mapboxId = planned.get(node.key)
    if (!mapboxId) continue

    const holder = held.get(mapboxId)
    if (holder) {
      const refusal = adoptionRefusal(node, holder, subtree)
      if (refusal) failures.set(node.key, refusal)
      else {
        known.set(node.key, holder.id)
        adopted += 1
      }
      continue
    }

    const parent = parentRegionId(node, known, targetId)
    if (parent === null) {
      failures.set(node.key, 'the region above it could not be created')
      continue
    }

    const data = regionCreateData(node, parent, batchId)
    if (!data) {
      failures.set(node.key, 'it has no location to create it at')
      continue
    }

    const outcome = await createRegion(req, { ...data, slug: freeSlug(data.slug, taken) }, taken)
    if (outcome.kind === 'created') {
      known.set(node.key, outcome.id)
      created += 1
      continue
    }
    if (outcome.kind === 'lost-feature') {
      // A concurrent writer took the feature between the read above and this
      // create; it is adoptable under the same rule as one found by the read.
      const [winner] = (await regionsHolding(req, [mapboxId])).values()
      const refusal = winner ? adoptionRefusal(node, winner, subtree) : outcome.reason
      if (winner && !refusal) {
        known.set(node.key, winner.id)
        adopted += 1
      } else failures.set(node.key, refusal ?? outcome.reason)
      continue
    }
    failures.set(node.key, outcome.reason)
  }

  return { known, failures, created, adopted }
}

interface Holder {
  id: number
  level: Region['level']
}

/** Why a region holding the planned feature is not this node's, or null. */
function adoptionRefusal(
  node: ProposedNode,
  holder: Holder,
  subtree: ReadonlyMap<number, SubtreeRegion>,
): null | string {
  if (!subtree.has(holder.id)) {
    return 'a region elsewhere in the Atlas already stands for this place — map it in the review, or ask an admin'
  }
  if (holder.level !== node.level) {
    return `the region standing for this place is a ${holder.level}, not a ${node.level}`
  }
  return null
}

type CreateOutcome =
  | { kind: 'created'; id: number }
  | { kind: 'lost-feature'; reason: string }
  | { kind: 'refused'; reason: string }

/**
 * Create one region, re-slugging once if the slug was taken in the meantime.
 *
 * Throws anything that is not the database refusing this region's own data.
 */
async function createRegion(
  req: PayloadRequest,
  data: Record<string, unknown> & { slug: string },
  taken: Set<string>,
): Promise<CreateOutcome> {
  let attempt = data
  for (let tries = 0; tries < 2; tries++) {
    try {
      const region = await req.payload.create({
        collection: 'regions',
        data: attempt as never,
        overrideAccess: true,
        depth: 0,
        select: { level: true },
        // Its own, because its parent may be the node written just before it —
        // see `commitWriteReq`.
        req: commitWriteReq(req),
      })
      taken.add(attempt.slug)
      return { kind: 'created', id: region.id }
    } catch (error) {
      const fields = validationFieldErrors(error)
      if (!fields) throw error
      const paths = new Set(fields.map((field) => field.path))
      if (paths.has('mapboxId')) {
        return { kind: 'lost-feature', reason: describeValidationErrors(fields).join('; ') }
      }
      if (paths.has('slug') && tries === 0) {
        taken.add(attempt.slug)
        attempt = { ...attempt, slug: freeSlug(attempt.slug, taken) }
        continue
      }
      return { kind: 'refused', reason: describeValidationErrors(fields).join('; ') }
    }
  }
  return { kind: 'refused', reason: 'its name is already taken' }
}

/** `slug`, or the first `slug-N` nobody holds. */
function freeSlug(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) {
    const candidate = `${slug}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** The regions already carrying any of these ids. */
async function regionsHolding(
  req: PayloadRequest,
  mapboxIds: readonly string[],
): Promise<Map<string, Holder>> {
  if (!mapboxIds.length) return new Map()
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { mapboxId: { in: [...mapboxIds] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { mapboxId: true, level: true },
    req,
  })
  return new Map(
    (docs as Region[]).map((region) => [region.mapboxId, { id: region.id, level: region.level }]),
  )
}
