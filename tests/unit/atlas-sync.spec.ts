import { describe, expect, it } from 'vitest'

import { cleanContactInfo, cleanText, hasInvisibleJunk } from '../../seeds/atlas/sync/clean'
import { deriveExpectedCounts } from '../../seeds/atlas/sync/counts'
import {
  applyClientDecisions,
  CLIENT_SPLITS,
  EXCLUDED_CLIENT_LEGACY_IDS,
  EXCLUDED_EVENT_LEGACY_IDS,
  MERGED_EVENT_TARGETS,
  UNIMPORTABLE_REGIONS,
} from '../../seeds/atlas/sync/merges'
import {
  applyOverlay,
  OVERLAY_SPECS,
  type OverlaySpec,
  recordOverlay,
  type Row,
} from '../../seeds/atlas/sync/overlay'
import { verifyCountsForScript } from '../../seeds/lib/expectedCounts'

/**
 * The Atlas re-sync pipeline's pure parts (seeds/atlas/AGENTS.md, "The sync
 * pipeline"). The data they run over is local-only, so these are fixtures;
 * `pnpm atlas:sync check` runs the data's own invariants.
 */

const EVENTS = OVERLAY_SPECS.events

const row = (legacyId: number, fields: Record<string, unknown>): Row => ({
  legacyId,
  customName: null,
  description: null,
  venueId: null,
  contactInfo: null,
  ...fields,
})

describe('recordOverlay', () => {
  it('records only the fields grooming changed, against the mechanical basis', () => {
    const mechanical = [row(1, { customName: 'MEDITATION', description: 'Weekly. www.x.org' })]
    const curated = [row(1, { customName: null, description: 'Weekly.', website: 'https://x.org' })]

    const { entries, orphans } = recordOverlay(curated, mechanical, EVENTS)

    expect(orphans).toEqual([])
    expect(entries).toHaveLength(1)
    expect(entries[0].set).toEqual({
      customName: null,
      description: 'Weekly.',
      website: 'https://x.org',
    })
    expect(entries[0].basis.description).toBe('Weekly. www.x.org')
  })

  it('records a reviewed row with nothing changed, so it never reads as new', () => {
    const r = row(2, { customName: 'Kids’ Meditations' })
    const { entries } = recordOverlay([r], [r], EVENTS)
    expect(entries).toHaveLength(1)
    expect(entries[0].set).toEqual({})
  })

  it('never curates legacyData, which always comes from the fresh extraction', () => {
    const { entries } = recordOverlay(
      [row(3, { legacyData: { verified_at: 'a' } })],
      [row(3, { legacyData: { verified_at: 'b' } })],
      EVENTS,
    )
    expect(entries[0].set).toEqual({})
  })

  it('names a curated row with no mechanical twin instead of dropping it', () => {
    expect(recordOverlay([row(4, {})], [], EVENTS).orphans).toEqual(['4'])
  })

  it('keeps an exception-only table to the rows actually patched', () => {
    const spec: OverlaySpec = { reviewsEveryRow: false, watched: [] }
    const { entries } = recordOverlay(
      [row(5, {}), row(6, { name: 'Fixed' })],
      [row(5, {}), row(6, { name: 'fixed' })],
      spec,
    )
    expect(entries.map((e) => e.legacyId)).toEqual([6])
  })

  it('keys regions by level and id, since the levels share one id space', () => {
    const regions = OVERLAY_SPECS.regions
    const mechanical = [
      { legacyId: 1, level: 'country', name: 'New Zealand' },
      { legacyId: 1, level: 'area', name: 'metro vancouver' },
    ]
    const curated = [mechanical[0], { ...mechanical[1], name: 'Metro Vancouver' }]
    const { entries } = recordOverlay(curated, mechanical, regions)
    expect(entries.map((e) => e.key)).toEqual(['area:1'])
  })
})

describe('applyOverlay', () => {
  const groomedAgainst = [row(1, { customName: 'MEDITATION', description: 'Weekly. www.x.org' })]
  const curated = [row(1, { customName: null, description: 'Weekly.', website: 'https://x.org' })]
  const { entries } = recordOverlay(curated, groomedAgainst, EVENTS)

  it('re-applies every curated value while the row is unchanged upstream', () => {
    const { rows, outcomes } = applyOverlay(groomedAgainst, entries, EVENTS)
    expect(rows[0]).toMatchObject({
      customName: null,
      description: 'Weekly.',
      website: 'https://x.org',
    })
    expect(outcomes[0]).toMatchObject({ status: 'unchanged', staleFields: [] })
  })

  it('withholds a value whose source moved, and sends the row back for review', () => {
    const edited = [row(1, { customName: 'MEDITATION', description: 'Now fortnightly. www.x.org' })]
    const { rows, outcomes } = applyOverlay(edited, entries, EVENTS)

    // The title's sources did not move, so its curation survives …
    expect(rows[0].customName).toBeNull()
    // … but the description and the website lifted out of it are stale.
    expect(rows[0].description).toBe('Now fortnightly. www.x.org')
    expect(rows[0].website).toBeUndefined()
    expect(outcomes[0].status).toBe('changed')
    expect(outcomes[0].staleFields.sort()).toEqual(['description', 'website'])
  })

  it('flags a watched change even when no curated value depends on it', () => {
    const moved = [row(1, { ...groomedAgainst[0], venueId: 99 })]
    const { outcomes } = applyOverlay(moved, entries, EVENTS)
    // customName depends on venueId, so it is stale too.
    expect(outcomes[0]).toMatchObject({ status: 'changed', staleFields: ['customName'] })
  })

  it('reports a row it has never seen as new, and one that vanished as deleted', () => {
    const { outcomes, deletedUpstream } = applyOverlay([row(7, {})], entries, EVENTS)
    expect(outcomes).toEqual([
      { key: '7', legacyId: 7, status: 'new', changedFields: [], staleFields: [] },
    ])
    expect(deletedUpstream).toEqual(['1'])
  })
})

describe('the merge decisions', () => {
  it('only ever names an excluded row as merged away', () => {
    const notExcluded = Object.keys(MERGED_EVENT_TARGETS)
      .map(Number)
      .filter((id) => !EXCLUDED_EVENT_LEGACY_IDS.has(id))
    expect(notExcluded).toEqual([])
  })

  it('never merges into a row that is itself excluded', () => {
    const excludedSurvivors = Object.values(MERGED_EVENT_TARGETS).filter((id) =>
      EXCLUDED_EVENT_LEGACY_IDS.has(id),
    )
    expect(excludedSurvivors).toEqual([])
  })

  it('keys unimportable regions as level:legacyId', () => {
    for (const key of UNIMPORTABLE_REGIONS.keys())
      expect(key).toMatch(/^(country|region|area):\d+$/)
  })
})

describe('the client decisions (#1055)', () => {
  const france = { level: 'country', legacyId: 27 }
  const regions = [
    { legacyId: 27, level: 'country', name: 'France' },
    { legacyId: 83, level: 'region', name: 'Ile-de-France', parent: france },
    // Same name under another country: never the match.
    {
      legacyId: 90,
      level: 'region',
      name: 'Ile-de-France',
      parent: { level: 'country', legacyId: 1 },
    },
  ]
  const fr = {
    legacyId: 32,
    label: 'Sahaja Yoga FR',
    managerId: 350,
    enabled: true,
    clientId: 'atlas-key',
    location: france,
    config: { domain: 'sahajayoga.fr\r\nyogaessonne.fr', locale: 'fr' },
  }
  const dev = { legacyId: 33, label: 'Sahaj Atlas Dev', config: { domain: 'localhost' } }
  const atlas = { legacyId: 66, label: 'Sahaj Atlas', config: { domain: 'syatlas.pages.dev' } }

  it('leaves out the excluded services and splits the second site off', () => {
    const out = applyClientDecisions([fr, dev, atlas], regions)
    expect(out.map((c) => c.legacyId)).toEqual([32, -32])
    expect(out[0]).toMatchObject({ config: { domain: 'sahajayoga.fr', locale: 'fr' } })
    expect(out[1]).toMatchObject({
      label: 'Yoga Essonne',
      managerId: 350,
      enabled: true,
      clientId: null,
      config: { domain: 'yogaessonne.fr', locale: 'fr' },
      location: { level: 'region', legacyId: 83 },
      splitFrom: 32,
    })
  })

  it('does not mutate the rows it was given', () => {
    applyClientDecisions([fr], regions)
    expect(fr.config.domain).toBe('sahajayoga.fr\r\nyogaessonne.fr')
  })

  it('emits no split once Atlas has deleted its source', () => {
    expect(applyClientDecisions([dev], regions)).toEqual([])
  })

  it('throws rather than put a split site on its country', () => {
    expect(() => applyClientDecisions([fr], regions.slice(0, 1))).toThrow(/0 regions named/)
  })

  it('gives every split an id no Atlas row can hold', () => {
    for (const split of CLIENT_SPLITS) {
      expect(split.legacyId).toBeLessThan(0)
      expect(EXCLUDED_CLIENT_LEGACY_IDS.has(split.from)).toBe(false)
    }
    expect(new Set(CLIENT_SPLITS.map((s) => s.legacyId)).size).toBe(CLIENT_SPLITS.length)
  })
})

describe('deriveExpectedCounts', () => {
  const data = {
    managers: [{ legacyId: 1 }],
    regions: [
      { legacyId: 1, level: 'country' },
      { legacyId: 42, level: 'region' },
      { legacyId: 10, level: 'area' },
    ],
    venues: [{ legacyId: 100 }],
    users: [
      { legacyId: 1, email: 'a@x.org' },
      { legacyId: 2, email: 'A@x.org ' },
      { legacyId: 3, email: 'not an address' },
    ],
    events: [
      { legacyId: 1, category: 'dropin', managerId: 1, venueId: 100, areaId: 10 },
      { legacyId: 2, category: 'dropin', managerId: 1, venueId: 100, areaId: 10 },
      { legacyId: 3, category: 'dropin', managerId: 1, venueId: null, areaId: null },
      {
        legacyId: 4,
        category: 'dropin',
        managerId: 1,
        venueId: null,
        areaId: 10,
        legacyData: { archived_at: '2025-01-01T00:00:00.000Z', verified_at: null },
      },
      // Inactive with nobody to reach: imported as a draft, which still counts.
      {
        legacyId: 5,
        category: 'inactive',
        managerId: 1,
        venueId: null,
        areaId: 10,
        contactInfo: null,
      },
    ],
    registrations: [
      { userId: 1, eventId: 1 },
      { userId: 3, eventId: 1 },
      { userId: 2, eventId: 3 },
      { userId: 2, eventId: 4 },
    ],
    clients: [{ managerId: 1 }, { managerId: 9 }],
  }

  it('mirrors each importer skip', () => {
    expect(deriveExpectedCounts(data)).toEqual({
      managers: 1,
      // region:East (#42) never imports; venue 100 is shared by two events.
      regions: 3,
      // Case-variant duplicates collapse, and a non-address never imports.
      users: 1,
      // #3 has no region, and #4 imports straight into the trash.
      events: 3,
      // Only the valid registrant on a counted event lands.
      'user-submissions': 1,
      clients: 1,
    })
  })
})

describe('atlas floors from the data', () => {
  it('verifies against the floors the importer hands over', () => {
    const { results, allPassed } = verifyCountsForScript('atlas', { managers: 5 }, undefined, {
      managers: 5,
    })
    expect(allPassed).toBe(true)
    expect(results).toEqual([{ collection: 'managers', actual: 5, expected: 5, passed: true }])
  })

  it('fails, rather than passing silently, when no floors arrived', () => {
    const { allPassed, skippedReason } = verifyCountsForScript('atlas', { managers: 5 })
    expect(allPassed).toBe(false)
    expect(skippedReason).toBeUndefined()
  })
})

describe('the mechanical clean', () => {
  it('removes the copy-paste junk the grooming pass removed by rule', () => {
    expect(cleanText('\u2800\u2800Weekly  class\u200B\r\n\r\n\r\n\tAll welcome </br>Free ')).toBe(
      'Weekly class\n\nAll welcome\nFree',
    )
  })

  it('drops HTML tags and keeps their text', () => {
    expect(cleanText('<b> Class is in Room 2 </b>')).toBe('Class is in Room 2')
  })

  it('answers null for a value with nothing left, never an empty string', () => {
    expect(cleanText('  \u200B ')).toBeNull()
    expect(cleanContactInfo({ phone_name: '', phone_number: ' ' })).toBeNull()
    expect(cleanContactInfo({ phone_name: '', phone_number: '+1 866 ' })).toEqual({
      phone_number: '+1 866',
    })
  })

  it('keeps a zero-width joiner that joins an emoji, and only that one', () => {
    expect(cleanText('Reset 🧘\u200D♂️')).toBe('Reset 🧘\u200D♂️')
    expect(hasInvisibleJunk('Reset 🧘\u200D♂️')).toBe(false)
    expect(hasInvisibleJunk('Re\u200Dset')).toBe(true)
    expect(cleanText('Re\u200Dset')).toBe('Reset')
  })
})
