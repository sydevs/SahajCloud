/**
 * What every import endpoint has to settle before it does its own work: which
 * batch, whether the caller owns its target, and what the target is.
 *
 * ⚠ **Shared because two endpoints deciding ownership differently is a hole, not
 * a style difference.** `refuseUnownedTarget` is the only place an import asks
 * whether a manager may write inside a region, and it asks the same
 * `ownedRegionFilterOptions` the admin's own region pickers do — a second
 * reading of "my subtree" would be a second answer to it.
 *
 * ⚠ **Every read here elevates past access deliberately.** The caller's right to
 * the batch comes from the collection's `access` (`access.ts`), and their right
 * to the target from `refuseUnownedTarget`. Once both hold, the region reads are
 * `overrideAccess: true` because a manager holds no `read` on a region outside
 * their subtree — and an ancestor country usually is outside it.
 */

import type { ExistingRegion } from './propose/match'
import type { PayloadRequest, Where } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { Region } from '@/payload-types'
import { ownedRegionFilterOptions } from '@/plugins/access'

import { resolveTargetScope, type TargetChainNode, type TargetScope } from './resolve/targetScope'

export function failure(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status })
}

/**
 * The batch id in the route, or null when it is not one Postgres can hold.
 *
 * `isSafeInteger`, not `isInteger`: `1e30` is an integer and would reach
 * Postgres as an out-of-range `integer`, which escapes as a 500.
 */
export function batchIdOf(req: PayloadRequest): number | null {
  const id = Number(req.routeParams?.id)
  return Number.isSafeInteger(id) && id >= 1 ? id : null
}

/** Why a caller may or may not write inside a region's subtree. */
export type TargetOwnership = 'no-regions' | 'not-yours' | 'owned'

/**
 * Whether the caller may write inside the target's subtree.
 *
 * ⚠ **Asked of the database, not of a list in memory.** `ownedRegionFilterOptions`
 * is the same scoping `events.region` and `regions.parent` offer in the admin, so
 * an endpoint deciding it differently would be a second definition of who owns
 * what. `true` is the admin's answer — `requireActiveManager` has already turned
 * away everyone who is not an active manager.
 *
 * Split from the refusal below because the Import tab's view has no `Response` to
 * return and has to ask the same question.
 */
export async function targetOwnership(
  req: PayloadRequest,
  targetId: number,
): Promise<TargetOwnership> {
  const scoped = await ownedRegionFilterOptions({ req })
  if (scoped === true) return 'owned'
  if (scoped === false) return 'no-regions'

  const { totalDocs } = await req.payload.count({
    collection: 'regions',
    where: { and: [{ id: { equals: targetId } }, scoped] },
    overrideAccess: true,
    req,
  })
  return totalDocs ? 'owned' : 'not-yours'
}

/** What each refused answer is told, shared with the Import tab's view. */
export const OWNERSHIP_REFUSAL: Record<Exclude<TargetOwnership, 'owned'>, string> = {
  'no-regions': 'You do not manage any region.',
  'not-yours': 'You do not manage that region.',
}

/** 403 unless the caller may write inside the target's subtree. */
export async function refuseUnownedTarget(
  req: PayloadRequest,
  targetId: number,
): Promise<Response | null> {
  const ownership = await targetOwnership(req, targetId)
  return ownership === 'owned' ? null : failure(OWNERSHIP_REFUSAL[ownership], 403)
}

/**
 * Every region at or beneath the target.
 *
 * ⚠ **One spelling, because two steps have to agree.** The resolve step reads the
 * classes already inside the target with it and the propose step reads the
 * regions; a node matched `existing` by one and `create` by the other is not an
 * error anyone sees, it is two cities.
 */
export function targetSubtreeWhere(targetId: number): Where {
  return { or: [{ id: { equals: targetId } }, { 'breadcrumbs.doc': { equals: targetId } }] }
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
   * ⚠ **Falls back to the slug, which `Regions` requires.** `name` is optional on
   * the collection, and the slug disambiguator reads this — an empty string there
   * would spell `pune-` for a city that collides.
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
 * ⚠ **One spelling, because the two steps have to agree about what exists.** The
 * propose step asks this twice — the target's subtree, then whoever holds a
 * feature the batch geocoded — and the review step asks it once, for the
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
 * across the collection (`slugs.ts`), so a batch proposing a city named like one
 * on the other side of the world still has to disambiguate. The include-mode
 * `select` is what stops every region's virtual URL fields running per row.
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
