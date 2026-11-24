/**
 * The city regions an import creates: one per town its rows name that has
 * none under the target yet, so a region's first upload need not wait on a
 * volunteer creating each town by hand.
 *
 * ⚠ **Created only where the target is known to contain the town.** The town's
 * own Mapbox state (under a region target) or country (under a country
 * target) must be the target's, read off the geocoded answer. Anything less
 * certain — a hand-entered target, an answer with no state, a legacy id that
 * does not compare — is skipped as before, with "create it first": a city
 * filed under the wrong state is worse than one the volunteer adds.
 *
 * ⚠ **Created as the uploader**, so the region subtree they may write decides,
 * as it does for the classes. The name is Mapbox's own, as the admin's location
 * picker fills it in, and the import page lists every region it created.
 */

import type { CreatedRegion, ImportRun } from './run'
import type { PayloadRequest } from 'payload'

import { APIError, ValidationError } from 'payload'

import { slugifyValue } from '@/fields/slugify'
import type { GeocodedLocation } from '@/lib/mapbox/geocoder'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import type { Region } from '@/payload-types'

/** A city region rows need, which the run creates once every row is checked. */
export interface PendingCity {
  /** The Mapbox place the city stands for: its `mapboxId`, and the run's key for it. */
  placeId: string
  name: string
  parentId: number
  parentName: string
}

export type CityPlan =
  | { ok: true; city: PendingCity }
  /** `missingCity`: the page may offer to create the town by hand. */
  | { ok: false; reason: string; missingCity: boolean }

/**
 * The city a row's town needs created, or why the run cannot create it.
 * `town` is how the refusal names it: Mapbox's name, else the row's own.
 */
export function planCity(run: ImportRun, location: GeocodedLocation, town: string): CityPlan {
  const { target } = run
  const createItFirst: CityPlan = {
    ok: false,
    reason: `no city region for "${town}" under ${target.name} — create it first`,
    missingCity: true,
  }
  if (!location.placeId || !location.placeName || isManualMapboxId(target.mapboxId)) {
    return createItFirst
  }

  const city = { placeId: location.placeId, name: location.placeName }
  if (target.level === 'region') {
    if (location.stateId !== target.mapboxId) return createItFirst
    return { ok: true, city: { ...city, parentId: target.id, parentName: target.name } }
  }
  if (target.level === 'country') {
    if (location.countryId !== target.mapboxId) return createItFirst
    const state = location.stateId ? run.states.get(location.stateId) : undefined
    const parent = state ?? { id: target.id, name: target.name }
    return { ok: true, city: { ...city, parentId: parent.id, parentName: parent.name } }
  }
  return createItFirst
}

/**
 * Create the cities rows are waiting on. Answers each place id with the new
 * region's id, or with the sentence its rows are skipped with.
 */
export async function createCities(
  req: PayloadRequest,
  run: ImportRun,
  pending: ReadonlyMap<string, { city: PendingCity; rows: number[] }>,
): Promise<Map<string, number | string>> {
  const outcome = new Map<string, number | string>()
  if (!pending.size) return outcome

  // `mapboxId` is unique across the tree, so a town already held outside the
  // target cannot be created again under it.
  const { docs: held } = await req.payload.find({
    collection: 'regions',
    where: { mapboxId: { in: [...pending.keys()] } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { mapboxId: true, name: true },
    req,
  })
  const heldElsewhere = new Map((held as Region[]).map((region) => [region.mapboxId, region]))

  for (const [placeId, { city, rows }] of pending) {
    const existing = heldElsewhere.get(placeId)
    if (existing) {
      outcome.set(
        placeId,
        `the city region "${existing.name ?? city.name}" already exists outside ${run.target.name} — import these rows into a region that contains it`,
      )
      continue
    }
    try {
      const region = await req.payload.create({
        collection: 'regions',
        data: {
          level: 'city',
          parent: city.parentId,
          mapboxId: placeId,
          name: city.name,
          slug: await freeSlug(req, city),
        },
        depth: 0,
        select: { name: true },
        user: run.uploader,
        overrideAccess: false,
        locale: run.locale as never,
      })
      outcome.set(placeId, region.id)
      run.createdRegions.push({
        regionId: region.id,
        name: city.name,
        parentId: city.parentId,
        parentName: city.parentName,
        rows,
      } satisfies CreatedRegion)
    } catch (error) {
      outcome.set(placeId, refusalOf(error, city))
    }
  }
  return outcome
}

/**
 * The town's own slug, or one qualified by its parent where another region has
 * it — `georgia-united-states` is how the Atlas migration told namesakes apart.
 */
async function freeSlug(req: PayloadRequest, city: PendingCity): Promise<string> {
  const base = slugifyValue(city.name) || 'city'
  const qualified = `${base}-${slugifyValue(city.parentName)}`
  const candidates = [base, qualified, ...[2, 3, 4, 5].map((n) => `${qualified}-${n}`)]
  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { slug: { in: candidates } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { slug: true },
    req,
  })
  const taken = new Set((docs as Region[]).map(({ slug }) => slug))
  return candidates.find((slug) => !taken.has(slug)) ?? `${qualified}-${Date.now()}`
}

function refusalOf(error: unknown, city: PendingCity): string {
  const why =
    error instanceof ValidationError
      ? error.data.errors.map(({ message, path }) => `${path}: ${message}`).join('; ')
      : error instanceof APIError && error.status === 403
        ? `you may not add regions under ${city.parentName}`
        : error instanceof Error
          ? error.message
          : String(error)
  return `the city region "${city.name}" could not be created (${why}) — create it in Regions, then upload these rows again`
}
