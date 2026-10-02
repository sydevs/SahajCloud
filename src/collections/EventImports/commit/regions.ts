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
 * ⚠ **The read comes before every write, so a collision is the rare case rather
 * than the resume path.** Recovering from a unique violation would mean a
 * savepoint — each row is its own write here, with no transaction to protect —
 * and catching one still leaves the region unidentified. A failed create is
 * reported against the node instead, and the rows it holds become row errors.
 */

import type { ProposedNode } from '../propose/tree'
import type { PayloadRequest } from 'payload'

import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'
import type { Region } from '@/payload-types'

import { creatableNodes, matchedRegionIds, parentRegionId } from './placement'
import { plannedMapboxId, regionCreateData } from './regionData'
import { freshScopeReq } from './scope'

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
}

export async function ensureProposedRegions(
  req: PayloadRequest,
  { batchId, targetId, nodes }: EnsureRegionsArgs,
): Promise<EnsuredRegions> {
  const known = matchedRegionIds(nodes)
  const failures = new Map<string, string>()
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

  const held = await regionsHolding(req, [...new Set(planned.values())])
  let created = 0
  let adopted = 0

  for (const node of creatable) {
    const mapboxId = planned.get(node.key)
    if (!mapboxId) continue

    const already = held.get(mapboxId)
    if (already !== undefined) {
      known.set(node.key, already)
      adopted += 1
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

    try {
      const region = await req.payload.create({
        collection: 'regions',
        data: data as never,
        overrideAccess: true,
        depth: 0,
        // Its own, because its parent may be the node written just before it —
        // see `freshScopeReq`.
        req: freshScopeReq(req),
      })
      known.set(node.key, region.id)
      created += 1
    } catch (error) {
      failures.set(node.key, refusalOf(error))
    }
  }

  return { known, failures, created, adopted }
}

/**
 * The regions already carrying any of these ids.
 *
 * `trash: true`, unlike the propose step's reads: a trashed region still holds
 * the unique id, so omitting it would report the region absent and the create
 * would then fail on the constraint (`src/collections/CLAUDE.md`).
 */
async function regionsHolding(
  req: PayloadRequest,
  mapboxIds: readonly string[],
): Promise<Map<string, number>> {
  if (!mapboxIds.length) return new Map()
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { mapboxId: { in: [...mapboxIds] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    trash: true,
    select: { mapboxId: true },
    req,
  })
  return new Map((docs as Region[]).map((region) => [region.mapboxId, region.id]))
}

/**
 * Why a region could not be written, in words a volunteer can act on.
 *
 * A slug or a feature claimed between the review and the commit is the one this
 * exists for, and it reaches here as a plain unique-constraint error rather than
 * a field error — so the fallback has to say what to do rather than name a
 * column.
 */
function refusalOf(error: unknown): string {
  const fields = validationFieldErrors(error)
  if (fields?.length) return describeValidationErrors(fields).join('; ')
  return 'it could not be created — its name or location may have been taken since the review'
}
