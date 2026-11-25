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

import type { ImportRow, ImportRun } from './run'
import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { slugify } from '@/fields/slugify'
import type { GeocodedLocation } from '@/lib/mapbox/geocoder'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import { describeValidationErrors, validationFieldErrors } from '@/lib/utilities/validationFailure'

import { regionsWhere } from './regions'

/** A city region rows need, which the run creates once every row is checked. */
export interface PendingCity {
  /** The Mapbox place the city stands for: its `mapboxId`, and the run's key for it. */
  placeId: string
  name: string
  parentId: number
  parentName: string
}

/** The city a row's town needs created, or null when the run may not create it. */
export function planCity(run: ImportRun, location: GeocodedLocation): null | PendingCity {
  const { target } = run
  const { placeId, placeName } = location
  if (!placeId || !placeName || isManualMapboxId(target.mapboxId)) return null

  if (target.level === 'region') {
    if (location.stateId !== target.mapboxId) return null
    return { placeId, name: placeName, parentId: target.id, parentName: target.name }
  }
  if (target.level === 'country') {
    if (location.countryId !== target.mapboxId) return null
    const state = location.stateId ? run.states.get(location.stateId) : undefined
    const parent = state ?? { id: target.id, name: target.name }
    return { placeId, name: placeName, parentId: parent.id, parentName: parent.name }
  }
  return null
}

/**
 * Create the cities `rows` are waiting on, answering each place id with its
 * new region's id. A row whose city could not be created is skipped, naming why.
 */
export async function createCities(
  req: PayloadRequest,
  run: ImportRun,
  rows: readonly { row: ImportRow; pending?: PendingCity }[],
): Promise<Map<string, number>> {
  const byPlace = new Map<string, { city: PendingCity; rows: ImportRow[] }>()
  for (const { row, pending } of rows) {
    if (!pending) continue
    const entry = byPlace.get(pending.placeId)
    if (entry) entry.rows.push(row)
    else byPlace.set(pending.placeId, { city: pending, rows: [row] })
  }
  const created = new Map<string, number>()
  if (!byPlace.size) return created

  // `mapboxId` is unique across the tree, so a town already held outside the
  // target cannot be created again under it.
  const held = await regionsWhere(req, { mapboxId: { in: [...byPlace.keys()] } })
  const heldElsewhere = new Map(held.map((region) => [region.mapboxId, region]))
  const slugs = await slugAllocator(
    req,
    [...byPlace.values()].map(({ city }) => city),
  )

  for (const [placeId, { city, rows: waiting }] of byPlace) {
    // `missingCity` lets the page offer to create the town by hand.
    const skipAll = (reason: string, missingCity?: { name: string }) => {
      for (const row of waiting) {
        run.skipped.push({ ...row, reasons: [reason], ...(missingCity && { missingCity }) })
      }
    }
    const existing = heldElsewhere.get(placeId)
    if (existing) {
      skipAll(
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
          slug: slugs(city),
        },
        depth: 0,
        select: { name: true },
        user: run.uploader,
        overrideAccess: false,
        locale: run.locale as never,
      })
      created.set(placeId, region.id)
      run.createdRegions.push({
        regionId: region.id,
        name: city.name,
        parentName: city.parentName,
        rows: waiting.map(({ row }) => row),
      })
    } catch (error) {
      skipAll(
        `the city region "${city.name}" could not be created (${refusalOf(error, city)}) — create it first`,
        { name: city.name },
      )
    }
  }
  return created
}

/**
 * Hands each city its own slug, or one qualified by its parent where another
 * region has it — `georgia-united-states` is how the Atlas migration told
 * namesakes apart. One query answers every candidate of the run.
 */
async function slugAllocator(
  req: PayloadRequest,
  cities: readonly PendingCity[],
): Promise<(city: PendingCity) => string> {
  const candidatesOf = (city: PendingCity) => {
    const base = slugify(city.name) || 'city'
    return [base, `${base}-${slugify(city.parentName) || 'city'}`]
  }
  const taken = new Set(
    (await regionsWhere(req, { slug: { in: cities.flatMap(candidatesOf) } })).map(
      ({ slug }) => slug,
    ),
  )
  return (city) => {
    const candidates = candidatesOf(city)
    // shortcut: two namesakes under one parent in one run repeat a slug, and
    // the second's create is refused as "create it first". Ladder it if that
    // ever happens.
    const slug = candidates.find((candidate) => !taken.has(candidate)) ?? candidates[1]
    taken.add(slug)
    return slug
  }
}

function refusalOf(error: unknown, city: PendingCity): string {
  const fields = validationFieldErrors(error)
  if (fields) return describeValidationErrors(fields).join('; ')
  if (error instanceof APIError && error.status === 403) {
    return `you may not add regions under ${city.parentName}`
  }
  return error instanceof Error ? error.message : String(error)
}
