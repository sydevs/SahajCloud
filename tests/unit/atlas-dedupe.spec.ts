import { describe, expect, it } from 'vitest'

import {
  dedupeAtlasData,
  VENUE_FIELD_OVERRIDES,
  VENUE_MERGES,
  venueMergeChains,
} from '../../seeds/atlas/dedupe'

/**
 * The venue merge-map is what makes two events at one address group into a
 * single shared venue. It's curated by hand, so these guard its structural
 * invariants — a chain or a self-reference would silently strand events on a
 * deleted venue row, which the importer would then import with no address.
 */
describe('VENUE_MERGES', () => {
  it('has no chains — every target is terminal', () => {
    // Merges are applied in ONE pass: `342 -> 104 -> 11` would leave 342's
    // events pointing at 104 after 104 itself was deleted.
    expect(venueMergeChains()).toEqual([])
  })

  it('has no self-references or cycles', () => {
    for (const [from, to] of Object.entries(VENUE_MERGES)) {
      expect(Number(from)).not.toBe(to)
    }
  })

  it('only overrides fields on venues that survive the merge', () => {
    const deleted = new Set(Object.keys(VENUE_MERGES).map(Number))
    for (const legacyId of Object.keys(VENUE_FIELD_OVERRIDES).map(Number)) {
      expect(deleted.has(legacyId), `venue ${legacyId} is deleted, so an override is dead`).toBe(
        false,
      )
    }
  })
})

describe('dedupeAtlasData', () => {
  const build = () => ({
    regions: [],
    venues: [
      { legacyId: 11, name: 'Kept', city: 'Amsterdam' },
      { legacyId: 104, name: 'Dropped' },
      { legacyId: 342, name: 'Also dropped' },
      { legacyId: 514, name: 'Wrong name', postCode: '2512 GV' },
      { legacyId: 50, name: 'Atelier' },
      { legacyId: 999, name: 'Untouched' },
    ],
    events: [
      { areaId: null, venueId: 104 },
      { areaId: null, venueId: 342 },
      { areaId: null, venueId: 11 },
      { areaId: null, venueId: 50 },
      { areaId: null, venueId: 999 },
      { areaId: null, venueId: null },
    ],
  })

  it('re-points events off every deleted venue, including the chained one', () => {
    const data = build()
    dedupeAtlasData(data)
    // 104 and 342 both collapse onto 11 — not 342 -> 104 (a deleted row).
    expect(data.events.map((e) => e.venueId)).toEqual([11, 11, 11, 514, 999, null])
  })

  it('drops the merged venue rows and keeps the rest', () => {
    const data = build()
    const summary = dedupeAtlasData(data)
    expect(data.venues.map((v) => v.legacyId).sort((a, b) => a - b)).toEqual([11, 514, 999])
    expect(summary.venuesRemoved).toBe(3)
  })

  it('applies field repairs to the survivor', () => {
    const data = build()
    const summary = dedupeAtlasData(data)
    // 514 survives for its correct postcode, but 50 held the real venue name.
    expect(data.venues.find((v) => v.legacyId === 514)?.name).toBe('Atelier')
    expect(data.venues.find((v) => v.legacyId === 514)?.postCode).toBe('2512 GV')
    expect(summary.venueFieldsOverridden).toBeGreaterThan(0)
  })

  it('is idempotent — a second pass changes nothing', () => {
    const data = build()
    dedupeAtlasData(data)
    const after = JSON.stringify(data)
    const summary = dedupeAtlasData(data)
    expect(JSON.stringify(data)).toBe(after)
    expect(summary.venuesRemoved).toBe(0)
    expect(summary.eventsVenueRepointed).toBe(0)
  })

  it('leaves an event with no venue alone', () => {
    const data = build()
    dedupeAtlasData(data)
    expect(data.events.at(-1)?.venueId).toBeNull()
  })
})
