/**
 * The region reads an import makes: the target, and the cities beneath it a
 * row may be filed under.
 *
 * A row whose town has no city region under the target gets one, created by
 * the run (`cities.ts`).
 *
 * Every read elevates past access: the uploader's right to the target was
 * settled by `targetRegion.ts` at the create, and the job runs with no user.
 */

import type { PayloadRequest, Where } from 'payload'

import type { Region } from '@/payload-types'

export interface ImportTarget {
  id: number
  level: Region['level']
  name: string
  /** The Mapbox feature the region stands for, or a `manual-` id. */
  mapboxId: string
}

export async function loadTarget(req: PayloadRequest, id: number): Promise<ImportTarget | null> {
  const region = (await req.payload.findByID({
    collection: 'regions',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    select: { level: true, name: true, slug: true, mapboxId: true },
    req,
  })) as Region | null
  if (!region) return null
  return {
    id: region.id,
    level: region.level,
    name: region.name?.trim() || region.slug,
    mapboxId: region.mapboxId,
  }
}

/** The regions matching `where`, read past access as every read here is. */
export function regionsWhere(req: PayloadRequest, where: Where): Promise<Region[]> {
  return req.payload
    .find({
      collection: 'regions',
      where,
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { mapboxId: true, name: true, slug: true },
      req,
    })
    .then(({ docs }) => docs as Region[])
}

/** City regions at or beneath the target, keyed by the Mapbox place id each stands for. */
export async function cityIndex(
  req: PayloadRequest,
  targetId: number,
): Promise<Map<string, number>> {
  const cities = await regionsWhere(req, {
    and: [
      { level: { equals: 'city' } },
      { or: [{ id: { equals: targetId } }, { 'breadcrumbs.doc': { equals: targetId } }] },
    ],
  })
  return new Map(cities.map((region) => [region.mapboxId, region.id]))
}

/**
 * The state regions under a country target, by the Mapbox id each holds, so a
 * created city is filed under its state where the Atlas has one. Empty for any
 * other target: a region target is the state, and a city target creates nothing.
 */
export async function stateIndex(
  req: PayloadRequest,
  target: ImportTarget,
): Promise<Map<string, { id: number; name: string }>> {
  if (target.level !== 'country') return new Map()
  const states = await regionsWhere(req, {
    and: [{ level: { equals: 'region' } }, { 'breadcrumbs.doc': { equals: target.id } }],
  })
  return new Map(
    states.map((region) => [
      region.mapboxId,
      { id: region.id, name: region.name?.trim() || region.slug },
    ]),
  )
}
