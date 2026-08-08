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
  legacyData: { archived_at?: string | null; verified_at?: string | null }
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
    // 673 extracted from the 2026-08 dump, less the 11 previously-merged
    // duplicates still in Atlas (re-dropped) and the 9 confirmed in this
    // refresh — see EXCLUDED_EVENT_LEGACY_IDS.
    expect(events).toHaveLength(653)
    expect(new Set(events.map((e) => e.legacyId)).size).toBe(653)
  })

  it('has no survivor left pointing at a removed duplicate', () => {
    const present = new Set(events.map((e) => e.legacyId))
    const removed = [
      // #605 pass (rows deleted upstream since are simply absent either way)
      82, 195, 355, 360, 392, 458, 461, 464, 468, 469, 496, 497, 534, 535, 752,
      // 2026-08 refresh
      1328, 1988, 2951, 3078, 4299, 4331, 4365, 4366, 5849,
    ]
    expect(removed.filter((id) => present.has(id))).toEqual([])
    // The survivors must all still be there. (#570/#571 were merge survivors
    // in #605 but have since been deleted in Atlas itself.)
    const survivors = [560, 562, 565, 603, 684, 698, 753, 2945, 3440, 4298, 4332, 4364, 4662, 5684]
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
    // Lifted out of free-text descriptions and promoted from the legacy
    // `contactInfo.email_address` the importer never read, across the #605
    // pass and the 2026-08 refresh (the QLD network's shared info@ address
    // accounts for six of them).
    expect(events.filter((e) => e.contactEmail).length).toBe(31)
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
    // #494 is the one leftover Atlas test record still in the file (the
    // importer skips it but keeps it in the venue-usage computation, and no
    // venue's multi-use status currently hinges on it either way).
    const usage = new Map<number, number>()
    for (const e of events) {
      if (e.venueId == null || [494, 575].includes(e.legacyId)) continue
      usage.set(e.venueId, (usage.get(e.venueId) ?? 0) + 1)
    }
    const sharedVenues = [...usage.values()].filter((count) => count > 1).length
    expect(sourceNodes).toHaveLength(595)
    expect(sharedVenues).toBe(52)
    // Less region:East, whose invalid source coordinates fail validation on
    // every run — proven by the local end-to-end reseed against a clean DB.
    expect(EXPECTED_COUNTS.atlas.regions).toBe(sourceNodes.length + sharedVenues - 1)
  })

  it('uses languageCodes only where a listing is genuinely multi-language', () => {
    // Atlas stored one `languageCode` per row; the curated override exists for
    // sessions listed once per language and then merged (#753, #4298), and for
    // rows whose own text declares both languages (bilingual workshops and
    // concerts).
    const merged = Object.fromEntries(
      events.filter((e) => e.languageCodes?.length).map((e) => [e.legacyId, e.languageCodes]),
    )
    expect(merged).toEqual({
      753: ['EN', 'FR'],
      4298: ['FR', 'NL'],
      4332: ['FR', 'EN'],
      4464: ['IT', 'EN'],
      4793: ['DE', 'RU'],
      4859: ['DE', 'EN'],
      5387: ['DE', 'EN'],
    })
  })

  it('preserves the legacy contactInfo keys the importer does not read', () => {
    // Atlas's contact_info also carries `meetup` / `facebook` / `email_name` /
    // `email_address`, mostly on dormant events where a contact is the whole
    // offer. The importer reads only phone_name/phone_number, so these are easy
    // to drop by accident — which happened once during the #605 grooming pass.
    // (13 rows before the refresh; upstream deletions and merges leave 10.)
    const withLegacyKeys = events.filter((e) =>
      Object.keys(e.contactInfo ?? {}).some((k) => !['phone_name', 'phone_number'].includes(k)),
    )
    expect(withLegacyKeys.length).toBe(10)
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

/**
 * The user and registration counts are derived from the dump the same way the
 * region count is — and for the same reason. Verification is `actual >=
 * expected`, so a constant that drifts *above* what can be imported fails every
 * run (which is what `users: 755` did), and one that drifts below degrades into
 * no check at all.
 */
describe('expected counts follow from the data', () => {
  const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const users = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'seeds/atlas/data/users.json'), 'utf-8'),
  ) as { legacyId: number; email: string | null }[]
  const registrations = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'seeds/atlas/data/registrations.json'), 'utf-8'),
  ) as { userId: number | null; eventId: number }[]

  const importable = users.filter((u) => EMAIL_SHAPE.test((u.email ?? '').trim()))

  it('counts users as the unique addresses that can actually be imported', () => {
    // 29 rows hold typed-in junk rather than an address; the rest collapse on
    // case-variant duplicates, since Payload stores email lowercased + unique.
    const unique = new Set(importable.map((u) => u.email!.trim().toLowerCase()))
    expect(users.length - importable.length).toBe(29)
    expect(EXPECTED_COUNTS.atlas.users).toBe(unique.size)
  })

  it('drops the registrations whose registrant or event cannot be imported', () => {
    const unimportable = new Set(
      users.filter((u) => !EMAIL_SHAPE.test((u.email ?? '').trim())).map((u) => u.legacyId),
    )
    // Mirrors MERGED_EVENT_TARGETS in seeds/atlas/import.ts: a registration on
    // a merged-away duplicate belongs to its survivor. Only events with neither
    // a row in events.json nor a survivor lose their registrations.
    const survivor: Record<number, number> = {
      195: 603,
      752: 753,
      360: 684,
      392: 698,
      458: 560,
      461: 565,
      464: 562,
      2951: 3440,
      1988: 4662,
      1328: 2945,
      3078: 4332,
      4331: 4332,
      4365: 4364,
      4366: 4364,
      4299: 4298,
      5849: 5684,
    }
    const eventIds = new Set(events.map((e) => e.legacyId))
    // Events whose Atlas `archived_at` is still current import straight into
    // the trash (importDeletedAt), and Payload silently rolls back a create
    // whose relationship target is trashed — so their registrations skip.
    const trashedOnImport = new Set(
      events
        .filter((e) => {
          const raw = e.legacyData
          return raw.archived_at && !(raw.verified_at && raw.verified_at > raw.archived_at)
        })
        .map((e) => e.legacyId),
    )
    const resolves = (id: number) =>
      (eventIds.has(id) && !trashedOnImport.has(id)) ||
      (eventIds.has(survivor[id] ?? -1) && !trashedOnImport.has(survivor[id] ?? -1))
    const orphaned = registrations.filter(
      (r) => (r.userId != null && unimportable.has(r.userId)) || !resolves(r.eventId),
    )
    expect(trashedOnImport.size).toBe(2) // #75 and #199
    expect(EXPECTED_COUNTS.atlas.registrations).toBe(registrations.length - orphaned.length)
  })
})
