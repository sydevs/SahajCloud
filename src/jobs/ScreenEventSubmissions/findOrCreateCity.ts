import type { Payload, PayloadRequest } from 'payload'

import { resolveRegionLocation } from '@/lib/mapbox/geocoder'
import { makeManualMapboxId } from '@/lib/mapbox/manualLocation'
import { slugifyValue } from '@/lib/utilities/slugify'

export interface FindOrCreateCityResult {
  regionId: number
  created: boolean
  /** Geocoder fallback note (manual location, no coordinates, …), when any. */
  warning?: string | null
}

/**
 * Resolve a city name to an existing Regions row under a given country/state,
 * creating it when absent — the controlled-rollout region policy for public
 * event submissions (and, later, the bulk importer): countries and states must
 * already exist (picked client-side from real rows); **only cities** are ever
 * auto-created, canonicalized through Mapbox; venues never are.
 *
 * Matching order:
 * 1. Forward-geocode the city (scoped to the country's ISO code — a country's
 *    `slug` is its alpha-2 code) via the existing `resolveRegionLocation`
 *    chain. A real `mapbox_id` match against an existing region wins: Mapbox
 *    is the identity authority, so "München" and "Munich" land on one row.
 * 2. Else match an existing city by slug under the same country subtree
 *    (catches manual-location rows that never got a Mapbox id).
 * 3. Else create the city under `state ?? country`, letting the Regions slug
 *    hook generate the slug; on a slug collision retry once with a
 *    parent-suffixed slug.
 *
 * Returns null only when the name is blank.
 */
export async function findOrCreateCity(args: {
  payload: Payload
  req?: PayloadRequest
  cityName: string
  /** Existing country region id (level `country`). */
  countryId: number
  /** Existing state/region id (level `region`), when known. */
  stateId?: number | null
  latitude?: number | null
  longitude?: number | null
}): Promise<FindOrCreateCityResult | null> {
  const { payload, req, countryId, stateId, latitude, longitude } = args
  const cityName = args.cityName.trim()
  if (!cityName) return null

  const country = await payload.findByID({
    collection: 'regions',
    id: countryId,
    depth: 0,
    overrideAccess: true,
    req,
  })
  // Countries slug as their ISO 3166-1 alpha-2 code (see the Atlas importer's
  // buildRegionSlugs); anything else means an unconventional row — geocode
  // unscoped rather than mis-scoped.
  const countryCode =
    typeof country.slug === 'string' && country.slug.length === 2 ? country.slug : null

  const { location, warning } = await resolveRegionLocation({
    name: cityName,
    level: 'city',
    latitude,
    longitude,
    countryCode,
  })

  // 1. Identity match on the canonical Mapbox id.
  if (!location.manual) {
    const { docs } = await payload.find({
      collection: 'regions',
      where: { mapboxId: { equals: location.mapboxId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    if (docs[0]) return { regionId: docs[0].id, created: false, warning }
  }

  // 2. Slug match under the same country subtree (manual-location rows).
  const slug = slugifyValue(cityName)
  const { docs: bySlug } = await payload.find({
    collection: 'regions',
    where: {
      and: [
        { slug: { equals: slug } },
        { level: { equals: 'city' } },
        { or: [{ 'breadcrumbs.doc': { equals: countryId } }, { parent: { equals: countryId } }] },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (bySlug[0]) return { regionId: bySlug[0].id, created: false, warning }

  // 3. Create under the state when given, else directly under the country
  //    (ALLOWED_PARENT_LEVELS permits both for a city).
  const data = {
    level: 'city' as const,
    name: cityName,
    parent: stateId ?? countryId,
    ...(location.manual
      ? {
          mapboxId: makeManualMapboxId(`submission-${slug}-${countryId}`),
          latitude: location.latitude,
          longitude: location.longitude,
          radius: location.radius,
        }
      : { mapboxId: location.mapboxId }),
  }

  try {
    const created = await payload.create({
      collection: 'regions',
      // `slug` is filled by the Regions slug hook — create's data type demands
      // hook-filled fields on input, hence the cast.
      data: data as never,
      overrideAccess: true,
      req,
    })
    return { regionId: created.id, created: true, warning }
  } catch (_error) {
    // Slug or mapboxId collision from a concurrent create → re-find; a slug
    // collision with a DIFFERENT city of the same name → retry with a
    // parent-suffixed slug.
    if (!location.manual) {
      const { docs } = await payload.find({
        collection: 'regions',
        where: { mapboxId: { equals: location.mapboxId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (docs[0]) return { regionId: docs[0].id, created: false, warning }
    }
    const created = await payload.create({
      collection: 'regions',
      data: {
        ...data,
        slug: `${slug}-${typeof country.slug === 'string' ? country.slug : countryId}`,
        generateSlug: false,
      } as never,
      overrideAccess: true,
      req,
    })
    return { regionId: created.id, created: true, warning }
  }
}
