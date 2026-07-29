import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Guards the grooming pass applied to events.json (#590 follow-up): the free-text
 * `customName` / `room` / `description` fields were cleaned of whitespace and
 * copy-paste junk, of information the listing already renders from a structured
 * field (address, schedule, contact, URLs), and of dates that have gone stale.
 *
 * These are data assertions, not code assertions — they exist so a future
 * re-extraction (which regenerates the file from the SQL dump and drops every
 * curated value) can't quietly undo the pass. See seeds/atlas/AGENTS.md.
 */

interface AtlasEventRow {
  legacyId: number
  customName: string | null
  room: string | null
  description: string | null
  onlineUrl: string | null
  registrationUrl: string | null
  website?: string
  contactEmail?: string
  contactInfo: { phone_name?: string; phone_number?: string } | null
  schedule: { frequency: string; weekday: string | null } | null
}

const DATA_PATH = path.resolve(process.cwd(), 'seeds/atlas/data/events.json')
const raw = readFileSync(DATA_PATH, 'utf-8')
const events: AtlasEventRow[] = JSON.parse(raw)

const TEXT_FIELDS = ['customName', 'room', 'description'] as const
const textValues = (e: AtlasEventRow) =>
  TEXT_FIELDS.map((f) => e[f]).filter((v): v is string => typeof v === 'string')

/** legacyIds of rows violating `predicate`, for a readable failure message. */
const offenders = (predicate: (e: AtlasEventRow) => boolean) =>
  events.filter(predicate).map((e) => e.legacyId)

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"')]+/i
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]{2,}/

describe('events.json integrity', () => {
  it('still holds every source row', () => {
    expect(events).toHaveLength(511)
    expect(new Set(events.map((e) => e.legacyId)).size).toBe(511)
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
    const bad = offenders((e) => {
      const text = `${e.description ?? ''} ${e.customName ?? ''}`
      return (text.match(/\b(?:19|20)\d{2}\b/g) ?? []).some((y) => y !== '1970' && Number(y) < 2026)
    })
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
    // `contactInfo.email_address` the importer never read.
    expect(events.filter((e) => e.contactEmail).length).toBe(28)
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
