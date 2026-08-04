import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { EMAIL_RE, findStaleDates, GENERIC_TITLE_RE, URL_RE } from '@/lib/eventQuality'

import { EXPECTED_COUNTS } from '../../seeds/lib/expectedCounts'

/**
 * Guards the grooming pass applied to events.json (#590 follow-up): the free-text
 * `customName` / `room` / `description` fields were cleaned of whitespace and
 * copy-paste junk, of information the listing already renders from a structured
 * field (address, schedule, contact, URLs), and of dates that have gone stale.
 *
 * These are data assertions, not code assertions — they exist so a future
 * re-extraction (which regenerates the file from the SQL dump and drops every
 * curated value) can't quietly undo the pass. See seeds/atlas/AGENTS.md.
 *
 * The heuristics themselves are imported from `@/lib/eventQuality` (#609),
 * which makes the same judgements permanently on every listing a manager
 * edits. Shared rather than copied so the migration's definition of "a URL in
 * the description" and the runtime's can't drift apart.
 */

interface AtlasEventRow {
  legacyId: number
  eventType: 'offline' | 'online'
  venueId: number | null
  customName: string | null
  room: string | null
  description: string | null
  onlineUrl: string | null
  registrationUrl: string | null
  website?: string
  contactEmail?: string
  languageCodes?: string[]
  contactInfo: { phone_name?: string; phone_number?: string } | null
  schedule: { frequency: string; weekday: string | null } | null
}

const DATA_PATH = path.resolve(process.cwd(), 'seeds/atlas/data/events.json')
const raw = readFileSync(DATA_PATH, 'utf-8')
const events: AtlasEventRow[] = JSON.parse(raw)

/** Venue streets, for the title auto-fill checks below. */
const venueStreets = new Map<number, string>(
  (
    JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'seeds/atlas/data/venues.json'), 'utf-8'),
    ) as { legacyId: number; street: string | null }[]
  ).map((v) => [v.legacyId, (v.street ?? '').split(',')[0].trim()]),
)

const TEXT_FIELDS = ['customName', 'room', 'description'] as const
const textValues = (e: AtlasEventRow) =>
  TEXT_FIELDS.map((f) => e[f]).filter((v): v is string => typeof v === 'string')

/** legacyIds of rows violating `predicate`, for a readable failure message. */
const offenders = (predicate: (e: AtlasEventRow) => boolean) =>
  events.filter(predicate).map((e) => e.legacyId)

/**
 * The grooming pass was made in 2026, so every year it left behind must read as
 * current or future against that year — the same test the runtime check applies
 * against today's year.
 */
const GROOMING_YEAR = 2026

describe('events.json integrity', () => {
  it('holds every source row bar the removed duplicates', () => {
    // 511 extracted, less the 15 confirmed duplicates merged away (same venue,
    // weekday and start time as a surviving row) — see EXCLUDED_EVENT_LEGACY_IDS.
    expect(events).toHaveLength(496)
    expect(new Set(events.map((e) => e.legacyId)).size).toBe(496)
  })

  it('has no survivor left pointing at a removed duplicate', () => {
    const present = new Set(events.map((e) => e.legacyId))
    const removed = [82, 195, 355, 360, 392, 458, 461, 464, 468, 469, 496, 497, 534, 535, 752]
    expect(removed.filter((id) => present.has(id))).toEqual([])
    // The survivors must all still be there.
    const survivors = [560, 562, 565, 570, 571, 603, 684, 698, 753]
    expect(survivors.filter((id) => !present.has(id))).toEqual([])
  })

  it('is written exactly as extract.ts would write it', () => {
    // extract.ts uses `JSON.stringify(data, null, 2) + '\n'`. Keeping the
    // grooming byte-compatible with that means a re-extraction produces a clean
    // diff instead of a whole-file reformat.
    expect(`${JSON.stringify(events, null, 2)}\n`).toBe(raw)
  })
})

describe('events.json text hygiene', () => {
  it('carries no invisible copy-paste characters', () => {
    // U+2800 braille blanks (VK padding) and U+200B zero-width spaces.
    const bad = offenders((e) => textValues(e).some((v) => /[⠀​-‍﻿]/.test(v)))
    expect(bad).toEqual([])
  })

  it('carries no carriage returns or tabs', () => {
    expect(offenders((e) => textValues(e).some((v) => /[\r\t]/.test(v)))).toEqual([])
  })

  it('carries no styled Mathematical Alphanumeric letters', () => {
    const bad = offenders((e) =>
      textValues(e).some((v) =>
        [...v].some((c) => c.codePointAt(0)! >= 0x1d400 && c.codePointAt(0)! <= 0x1d7ff),
      ),
    )
    expect(bad).toEqual([])
  })

  it('has no leading, trailing, or doubled internal whitespace', () => {
    expect(offenders((e) => textValues(e).some((v) => v !== v.trim()))).toEqual([])
    expect(offenders((e) => textValues(e).some((v) => /\S {2,}\S/.test(v)))).toEqual([])
  })

  it('has no runs of blank lines and no HTML', () => {
    expect(offenders((e) => /\n{3,}/.test(e.description ?? ''))).toEqual([])
    expect(offenders((e) => /<\/?[a-zA-Z][^>]*>/.test(e.description ?? ''))).toEqual([])
  })
})

describe('events.json redundancy', () => {
  it('keeps links out of descriptions — they belong in a URL field', () => {
    expect(offenders((e) => URL_RE.test(e.description ?? ''))).toEqual([])
  })

  it('keeps email addresses out of descriptions — they belong in contactEmail', () => {
    expect(offenders((e) => EMAIL_RE.test(e.description ?? ''))).toEqual([])
  })

  it('carries no dates that have already gone stale', () => {
    // 1970 is allowed: #511 cites Sahaja Yoga's founding year, not a schedule.
    // findStaleDates encodes that exemption.
    const bad = offenders(
      (e) =>
        findStaleDates(`${e.description ?? ''} ${e.customName ?? ''}`, GROOMING_YEAR).length > 0,
    )
    expect(bad).toEqual([])
  })
})

describe('events.json structured fields', () => {
  it('gives every non-daily recurrence a weekday', () => {
    const bad = offenders(
      (e) => ['weekly', 'monthly'].includes(e.schedule?.frequency ?? '') && !e.schedule?.weekday,
    )
    expect(bad).toEqual([])
  })

  it('stores absolute URLs in the URL fields', () => {
    const bad = offenders((e) =>
      (['onlineUrl', 'registrationUrl', 'website'] as const).some((f) => {
        const v = e[f]
        return typeof v === 'string' && v !== '' && !/^https?:\/\//.test(v)
      }),
    )
    expect(bad).toEqual([])
  })

  it('never stores an email address in a URL field', () => {
    const bad = offenders((e) =>
      (['onlineUrl', 'registrationUrl', 'website'] as const).some((f) => {
        const v = e[f]
        return typeof v === 'string' && new RegExp(`^${EMAIL_RE.source}$`).test(v)
      }),
    )
    expect(bad).toEqual([])
  })

  it('stores a valid address in every contactEmail', () => {
    const bad = offenders(
      (e) => !!e.contactEmail && !new RegExp(`^${EMAIL_RE.source}$`).test(e.contactEmail),
    )
    expect(bad).toEqual([])
    // 16 lifted out of free-text descriptions + 12 promoted from the legacy
    // `contactInfo.email_address` the importer never read, less one on a
    // removed duplicate.
    expect(events.filter((e) => e.contactEmail).length).toBe(27)
  })

  it('keeps no title that only says "meditation"', () => {
    // A generic custom name is strictly worse than the auto-title, which
    // localizes and can be improved for every event at once. A title earns its
    // place by naming something the auto-title can't: a venue, an audience, a
    // language, a format, or a named event.
    const bad = events.filter((e) => e.customName && GENERIC_TITLE_RE.test(e.customName.trim()))
    expect(bad.map((e) => `#${e.legacyId} ${e.customName}`)).toEqual([])
  })

  it('leaves no event unable to produce a title at all', () => {
    // A blank title only works when the auto-fill has something to work with:
    // an online event (the importer supplies its own fallback) or a street.
    const stranded = events.filter(
      (e) =>
        !e.customName &&
        e.eventType !== 'online' &&
        !(e.venueId != null && venueStreets.get(e.venueId)),
    )
    expect(stranded.map((e) => e.legacyId)).toEqual([])
  })

  it('derives the expected region count from the data', () => {
    // `EXPECTED_COUNTS.atlas.regions` has to equal what the importer actually
    // creates: every source geo node, plus one shared-venue node per venue used
    // by more than one *surviving* event. Verification is `actual >= expected`,
    // so a stale constant here quietly degrades into no check at all — which is
    // how it sat at 482 while the real figure moved to 518.
    const sourceNodes = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'seeds/atlas/data/regions.json'), 'utf-8'),
    ) as unknown[]
    // The two leftover Atlas test records are the only excluded ids still in the
    // file, and they carry a venue reference — so a venue whose second user is a
    // test record is single-use as far as the importer is concerned.
    const usage = new Map<number, number>()
    for (const e of events) {
      if (e.venueId == null || [494, 575].includes(e.legacyId)) continue
      usage.set(e.venueId, (usage.get(e.venueId) ?? 0) + 1)
    }
    const sharedVenues = [...usage.values()].filter((count) => count > 1).length
    expect(sourceNodes).toHaveLength(474)
    expect(sharedVenues).toBe(44)
    expect(EXPECTED_COUNTS.atlas.regions).toBe(sourceNodes.length + sharedVenues)
  })

  it('uses languageCodes only where two language listings were merged', () => {
    // Atlas stored one `languageCode` per row; the curated override exists for
    // a session that was listed twice, once per language.
    const merged = events.filter((e) => e.languageCodes?.length)
    expect(merged.map((e) => e.legacyId)).toEqual([753])
    expect(merged[0].languageCodes).toEqual(['EN', 'FR'])
  })

  it('preserves the legacy contactInfo keys the importer does not read', () => {
    // Atlas's contact_info also carries `meetup` / `facebook` / `email_name` /
    // `email_address`. 18 rows have the keys; 13 have at least one non-empty
    // value, mostly dormant events where a contact is the whole offer. The
    // importer reads only phone_name/phone_number, so these are easy to drop by
    // accident — which is exactly what happened once during the grooming pass.
    const withLegacyKeys = events.filter((e) =>
      Object.keys(e.contactInfo ?? {}).some((k) => !['phone_name', 'phone_number'].includes(k)),
    )
    expect(withLegacyKeys.length).toBe(13)
  })

  it('holds no empty-string contactInfo values, and no phone number in the name slot', () => {
    expect(
      offenders((e) => !!e.contactInfo && Object.values(e.contactInfo).some((v) => v === '')),
    ).toEqual([])
    const bad = offenders((e) => {
      const name = e.contactInfo?.phone_name
      return !!name && /^[\d+()\-.\s]{7,}$/.test(name)
    })
    expect(bad).toEqual([])
  })
})
