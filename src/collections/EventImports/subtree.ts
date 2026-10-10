/**
 * The region reads every import step shares: the target, its subtree, the
 * regions a node may match, and the slug namespace a created node must miss.
 *
 * ⚠ **Every read here elevates past access deliberately.** The uploader's right
 * to the target was settled by `targetRegion`'s own `validate` at create, and
 * the jobs run with no `req.user` at all. A manager holds no `read` on a region
 * outside their subtree — and an ancestor country usually is outside it.
 */

import type { ExistingRegion } from './propose/match'
import type { PayloadRequest, Where } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { Region } from '@/payload-types'

import { resolveTargetScope, type TargetChainNode, type TargetScope } from './resolve/targetScope'

/**
 * Every region at or beneath the target.
 *
 * ⚠ **One spelling, because two steps have to agree.** The resolve step reads
 * the classes already inside the target with it and the propose step reads the
 * regions; a node matched `existing` by one and `create` by the other is not an
 * error anyone sees, it is two cities.
 */
export function targetSubtreeWhere(targetId: number): Where {
  return { or: [{ id: { equals: targetId } }, { 'breadcrumbs.doc': { equals: targetId } }] }
}

/** One region at or beneath the target, as the commit checks placements against it. */
export interface SubtreeRegion {
  id: number
  level: Region['level']
  parentId: number | null
}

/**
 * Every region at or beneath the target, by id.
 *
 * ⚠ **Read fresh on every commit run.** A region the review matched can be
 * moved out of the target before the commit, and the commit's writes are
 * refused by no `filterOptions` scoping — so it would then file classes outside
 * the region the batch was aimed at.
 */
export async function readSubtree(
  req: PayloadRequest,
  targetId: number,
): Promise<Map<number, SubtreeRegion>> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: targetSubtreeWhere(targetId),
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { level: true, parent: true },
    req,
  })
  return new Map(
    (docs as Region[]).map((region) => [
      region.id,
      { id: region.id, level: region.level, parentId: relationId(region.parent) },
    ]),
  )
}

/** The target region itself, reduced to what a proposal names it by. */
export interface TargetRegion {
  id: number
  level: Region['level']
  /**
   * The geocoded feature the region stands for, or a `manual-` id where it was
   * placed by hand (`src/lib/mapbox/manualLocation.ts`).
   */
  mapboxId: string
  /**
   * ⚠ **Falls back to the slug, which `Regions` requires.** `name` is optional
   * on the collection, and the slug disambiguator reads this — an empty string
   * there would spell `pune-` for a city that collides.
   */
  name: string
}

export type LoadTargetResult =
  | {
      ok: true
      target: TargetRegion
      scope: TargetScope
      /** The narrowing this target does not get, for the review to show once. */
      warning?: string
    }
  | { ok: false; error: string }

/**
 * The target region and the two codes its rows are confined to.
 *
 * The chain is read as its own query rather than through `depth: 1`: a
 * breadcrumb's `doc` would hydrate each whole region, and all this reads is
 * three fields off each ancestor.
 */
export async function loadTarget(
  req: PayloadRequest,
  targetId: number,
): Promise<LoadTargetResult> {
  const target = (await req.payload.findByID({
    collection: 'regions',
    id: targetId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    select: { level: true, name: true, slug: true, mapboxId: true, breadcrumbs: true },
    req,
  })) as Region | null
  if (!target) return { ok: false, error: 'The target region no longer exists.' }

  // A region's own breadcrumbs include itself, so the target is filtered out of
  // the ancestor read and appended once below — it is already in hand.
  const ancestorIds = (target.breadcrumbs ?? [])
    .map((crumb) => relationId(crumb.doc))
    .filter((id): id is number => id !== null && id !== targetId)

  const ancestors = ancestorIds.length
    ? (
        await req.payload.find({
          collection: 'regions',
          where: { id: { in: ancestorIds } },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          select: { level: true, name: true, slug: true },
          req,
        })
      ).docs
    : []

  const chain: TargetChainNode[] = [...ancestors, target].map(({ level, name, slug }) => ({
    level,
    name,
    slug,
  }))
  const resolved = resolveTargetScope(chain)
  if (!resolved.ok) return { ok: false, error: resolved.error }

  const named: TargetRegion = {
    id: targetId,
    level: target.level,
    mapboxId: target.mapboxId,
    name: target.name?.trim() || target.slug,
  }
  return resolved.warning
    ? { ok: true, target: named, scope: resolved.scope, warning: resolved.warning }
    : { ok: true, target: named, scope: resolved.scope }
}

/**
 * Existing regions as the proposal and the review both read them.
 *
 * ⚠ **One spelling, because the two steps have to agree about what exists.**
 * The propose step asks this twice — the target's subtree, then whoever holds a
 * feature the batch geocoded — and the review surface asks it once, for the
 * regions a reviewer may map a node onto. A second `select` here is a second
 * answer to "which region is this", and `match.ts` decides on exactly these
 * five columns.
 */
export async function readExistingRegions(
  req: PayloadRequest,
  where: Where,
  inTarget: boolean,
): Promise<ExistingRegion[]> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    where,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { level: true, name: true, slug: true, mapboxId: true, parent: true },
    req,
  })

  return (docs as Region[]).map((region) => ({
    id: region.id,
    level: region.level,
    name: region.name,
    slug: region.slug,
    mapboxId: region.mapboxId,
    parentId: relationId(region.parent),
    inTarget,
  }))
}

/**
 * Every slug `regions` holds, which is the namespace a created node must miss.
 *
 * ⚠ **Collection-wide, never scoped to the subtree.** `Regions.slug` is unique
 * across the collection (`propose/slugs.ts`), so a batch proposing a city named
 * like one on the other side of the world still has to disambiguate. The
 * include-mode `select` is what stops every region's virtual URL fields running
 * per row.
 */
export async function readTakenSlugs(req: PayloadRequest): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { slug: true },
    req,
  })
  return docs.map((region) => region.slug)
}
