/**
 * De-duplicate the extracted Atlas data so every region resolves to a distinct
 * `Regions.mapboxId` (the column is `unique`). Atlas contains a handful of
 * regions that are the *same place* recorded twice (and one city/region overlap),
 * which the geocoder collapses onto one Mapbox feature.
 *
 * This is a curated, idempotent merge-map keyed on the Atlas natural key
 * (`level` + `legacyId`). It edits `regions.json` / `venues.json` / `events.json`
 * in place and is wired into `extract.ts`, so a refetch reproduces the same
 * de-duplicated output. Re-running on already-clean data is a no-op.
 *
 * NOTE: genuinely *different* places that merely geocode to the same feature
 * (e.g. Liverpool, Nova Scotia vs Liverpool, England) are NOT merged here — they
 * are disambiguated at geocode time via the region's country (see geocoder.ts).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** Duplicate cities (Atlas `area`): delete legacyId → keep legacyId. */
const AREA_MERGES: Record<number, number> = {
  84: 122, // Jihlava (CZ)
  57: 183, // Salzburg (AT) — keep the one parented to the Salzburg region
  73: 215, // Leicester (GB) — keep the one parented to the Midlands
  263: 190, // Manacor (ES)
  429: 247, // Wingham (AU)
  436: 367, // Stalden-Saas (CH)
  392: 438, // Paris (FR) — drop "Paris - IDF" (under France); keep "Paris" (under Île-de-France, has the events)
}

/** Duplicate venues (become `center` nodes): delete legacyId → keep legacyId. */
const VENUE_MERGES: Record<number, number> = {
  342: 104, // Manenburgstraat 22, Amsterdam
}

/** Region nodes removed outright because a city already covers the place. */
const REGION_DELETES: Array<{ level: string; legacyId: number }> = [
  { level: 'region', legacyId: 35 }, // Wien — Vienna (the city) takes precedence
]

/** Parent overrides applied after deletes (promote a node whose parent was removed). */
const REPARENT: Array<{
  level: string
  legacyId: number
  parent: { level: string; legacyId: number }
}> = [
  { level: 'area', legacyId: 56, parent: { level: 'country', legacyId: 9 } }, // Vienna → Austria
]

interface GeoNode {
  level: string
  legacyId: number
  parent: { level: string; legacyId: number } | null
}
interface AtlasEvent {
  areaId: number | null
  venueId: number | null
}
interface AtlasVenue {
  legacyId: number
}

export interface DedupeData {
  regions: GeoNode[]
  venues: AtlasVenue[]
  events: AtlasEvent[]
}

export interface DedupeSummary {
  regionsRemoved: number
  venuesRemoved: number
  eventsAreaRepointed: number
  eventsVenueRepointed: number
  reparented: number
}

/** Apply the merge-map to in-memory Atlas data (mutates `data`). Idempotent. */
export function dedupeAtlasData(data: DedupeData): DedupeSummary {
  const summary: DedupeSummary = {
    regionsRemoved: 0,
    venuesRemoved: 0,
    eventsAreaRepointed: 0,
    eventsVenueRepointed: 0,
    reparented: 0,
  }

  // 1. Re-point events from the deleted area/venue to the kept one.
  for (const event of data.events) {
    if (event.areaId != null && AREA_MERGES[event.areaId] != null) {
      event.areaId = AREA_MERGES[event.areaId]
      summary.eventsAreaRepointed++
    }
    if (event.venueId != null && VENUE_MERGES[event.venueId] != null) {
      event.venueId = VENUE_MERGES[event.venueId]
      summary.eventsVenueRepointed++
    }
  }

  // 2. Reparent overrides (before the delete filter — the node itself survives).
  for (const rp of REPARENT) {
    const node = data.regions.find((r) => r.level === rp.level && r.legacyId === rp.legacyId)
    if (
      node &&
      (node.parent?.level !== rp.parent.level || node.parent?.legacyId !== rp.parent.legacyId)
    ) {
      node.parent = { ...rp.parent }
      summary.reparented++
    }
  }

  // 3. Drop the duplicate areas and the explicitly-deleted region nodes.
  const deletedAreas = new Set(Object.keys(AREA_MERGES).map(Number))
  const deletedRegions = new Set(REGION_DELETES.map((r) => `${r.level}:${r.legacyId}`))
  const beforeRegions = data.regions.length
  data.regions = data.regions.filter((r) => {
    if (r.level === 'area' && deletedAreas.has(r.legacyId)) return false
    if (deletedRegions.has(`${r.level}:${r.legacyId}`)) return false
    return true
  })
  summary.regionsRemoved = beforeRegions - data.regions.length

  // 4. Drop the duplicate venues.
  const deletedVenues = new Set(Object.keys(VENUE_MERGES).map(Number))
  const beforeVenues = data.venues.length
  data.venues = data.venues.filter((v) => !deletedVenues.has(v.legacyId))
  summary.venuesRemoved = beforeVenues - data.venues.length

  return summary
}

/** Read the on-disk Atlas JSONs, de-duplicate, and write them back in place. */
export function dedupeAtlasFiles(
  dir: string = path.join(process.cwd(), 'seeds/atlas/data'),
): DedupeSummary {
  const read = <T>(name: string): T =>
    JSON.parse(readFileSync(path.join(dir, `${name}.json`), 'utf8')) as T
  const write = (name: string, value: unknown): void =>
    writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value, null, 2) + '\n')

  const data: DedupeData = {
    regions: read<GeoNode[]>('regions'),
    venues: read<AtlasVenue[]>('venues'),
    events: read<AtlasEvent[]>('events'),
  }
  const summary = dedupeAtlasData(data)
  write('regions', data.regions)
  write('venues', data.venues)
  write('events', data.events)
  return summary
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const summary = dedupeAtlasFiles()
  console.log('Atlas dedupe complete:', JSON.stringify(summary, null, 2))
}
