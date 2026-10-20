/**
 * The region reads an import makes: the target, and the cities beneath it a
 * row may be filed under.
 *
 * ⚠ **The import creates no regions.** A row whose town has no city region
 * under the target is skipped with a sentence saying so; the volunteer creates
 * the city in Regions and uploads the skipped lines again.
 *
 * Every read elevates past access: the uploader's right to the target was
 * settled by `targetRegion.ts` at the create, and the job runs with no user.
 */

import type { PayloadRequest } from 'payload'

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

/** City regions at or beneath the target, keyed by the Mapbox place id each stands for. */
export async function cityIndex(
  req: PayloadRequest,
  targetId: number,
): Promise<Map<string, number>> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: {
      and: [
        { level: { equals: 'city' } },
        { or: [{ id: { equals: targetId } }, { 'breadcrumbs.doc': { equals: targetId } }] },
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { mapboxId: true },
    req,
  })
  return new Map((docs as Region[]).map((region) => [region.mapboxId, region.id]))
}
