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
  // ── 2026-08 dump. Each pair geocodes to one Mapbox feature (the unique
  // `mapboxId` catches them at import otherwise); the kept side is the id the
  // previously-seeded environments already know, so it updates instead of
  // colliding.
  1538: 226, // Nottingham (GB) — identical coords; 226 is parented to the Midlands
  2726: 364, // Colombier (CH) — both on the Neuchâtel lakeshore; 364 has the older events
  2198: 393, // Compiègne (FR) — identical coords
  2759: 2231, // Martinique (FR) — identical coords; 2231 has the events
  // "Province Québec" duplicates the Québec feature the province/city nodes
  // already claim; its two online events roll up under Québec (1472) instead.
  1807: 1472,
}

/**
 * Duplicate venues: delete legacyId → keep legacyId.
 *
 * Grouping keys on `venueId`, so two events at one address filed under two venue
 * rows each look single-use and neither becomes a shared venue. Every entry is
 * hand-verified — coordinates alone are not sufficient evidence, in either
 * direction: two Civitavecchia venues sit 177 m apart but are different places,
 * while Athens 386/432 are 230 m apart yet share a name, street, city *and*
 * postcode. The kept side is whichever carries the better data (a real name over
 * a street, a correct postcode over a wrong one).
 *
 * Targets must never themselves be keys — the merge is applied in one pass, so a
 * chain would leave events pointing at a deleted row. `dedupe.spec.ts` asserts
 * this.
 */
const VENUE_MERGES: Record<number, number> = {
  // Manenburgstraat 22, Amsterdam — now FOUR rows for one building. 11 keeps
  // the real name ("Sahaja Yoga Center Netherlands"); 104 was the old target,
  // so 342 is repointed past it rather than left dangling; 3116 arrived with
  // the 2026 dump's new course listings.
  342: 11,
  104: 11,
  3116: 11,
  513: 14, // Broekakkerseweg 1, Eindhoven — 14 has the fuller "Aktiviteitencentrum Orka"
  50: 514, // Westeinde 79A, The Hague — 50's postcode 1017ZP is Amsterdam's; 514's is right
  365: 100, // 16 Ramsden Rd, London — identical rows ("Balham Library")
  148: 260, // Herzog-Leopold-Straße 32 — 260 is named "BORG Wiener Neustadt", 148 just the street
  191: 215, // 169(a) King St, Norwich — 215 is "Wensum Sports Centre", which #315's own text names
  495: 271, // Sammonkatu 2, Tampere — both events meet in room "Ritva-sali"
  338: 500, // Vapaudenkatu 48-50, Jyväskylä — 500's name matches the full street range
  432: 386, // Vasilissis Sofias 26, Athens — identical name, street, city and postcode
  195: 217, // Chellaston Bowls Club, Derby — same club, 217 has the proper city casing
  // ── 2026-08 dump refresh ──
  4337: 4336, // Rue de Nimy 46, Mons — 4336 is named "P'tite Maison Folie"
  // 293 Mainzer Landstraße, Frankfurt — three rows for one concert hall; 5194
  // carries the venue's actual name ("stadtRAUMfrankfurt").
  5062: 5194,
  5293: 5194,
  4765: 4798, // Nottingham Central Library — 4798 has the clean single-segment street
  5063: 458, // Am Lilienberg 2(a), München — the 2026 concerts re-listed the existing building
  // Burgstraße 72, Frankfurt — 5095 ("Burgstraße", no number) and 5096 are the
  // same building as the older 492; three different managers list there.
  5095: 492,
  5096: 492,
}

/**
 * Field-level repairs applied to a *surviving* venue after a merge, where the
 * deleted row held the better value for one field. Kept here rather than edited
 * into venues.json so a re-extraction reproduces them.
 */
const VENUE_FIELD_OVERRIDES: Record<number, Partial<AtlasVenue>> = {
  // Kept for its correct The Hague postcode, but the deleted row (50) carried
  // the venue's actual name.
  514: { name: 'Atelier' },
  // Trailing whitespace on the surviving rows.
  14: { city: 'Eindhoven', postCode: '5641EC' },
  // The venue's `name` is its whole marketing slogan; a blank-titled event
  // there would auto-title to the entire sentence. "Málnárium" is the name.
  2125: { name: 'Málnárium' },
  // Lowercase city surfaces into the rendered address (the #605 casing class).
  5755: { city: 'Sydney' },
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
  name?: string | null
  street?: string | null
  city?: string | null
  postCode?: string | null
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
  venueFieldsOverridden: number
}

/** Merge targets must be terminal — a chain would strand events on a deleted row. */
export function venueMergeChains(): number[] {
  return Object.values(VENUE_MERGES).filter((target) => VENUE_MERGES[target] != null)
}

export { VENUE_MERGES, VENUE_FIELD_OVERRIDES }

/** Apply the merge-map to in-memory Atlas data (mutates `data`). Idempotent. */
export function dedupeAtlasData(data: DedupeData): DedupeSummary {
  const summary: DedupeSummary = {
    regionsRemoved: 0,
    venuesRemoved: 0,
    eventsAreaRepointed: 0,
    eventsVenueRepointed: 0,
    reparented: 0,
    venueFieldsOverridden: 0,
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

  // 5. Repair fields on a survivor where the deleted row held the better value.
  for (const venue of data.venues) {
    const overrides = VENUE_FIELD_OVERRIDES[venue.legacyId]
    if (!overrides) continue
    for (const [field, value] of Object.entries(overrides)) {
      if (venue[field as keyof AtlasVenue] === value) continue
      Object.assign(venue, { [field]: value })
      summary.venueFieldsOverridden++
    }
  }

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
