/**
 * Invariants over the built atlas data — the grooming rules a re-sync must
 * not undo, and the write contracts a seed run would otherwise discover 2000
 * rows in. These were unit specs while the data was committed; the data is
 * local now, so they run here, as the last step before a seed.
 *
 * Every check returns the offending rows, never a bare count, so a failure
 * names what to fix. See seeds/atlas/AGENTS.md for the rules themselves.
 */
import { checkSubmissionData, SUBSCRIBE_OPT_IN } from '@/collections/UserSubmissions/submissionData'
import { EMAIL_RE, findStaleDates, GENERIC_TITLE_RE, URL_RE } from '@/lib/eventQuality'

import { hasInvisibleJunk } from './clean'
import { EXCLUDED_EVENT_LEGACY_IDS, MERGED_EVENT_TARGETS } from './merges'
import { registrationSubmissionData } from '../helpers/registrations'

export interface CheckEvent {
  legacyId: number
  eventType: 'offline' | 'online'
  venueId: number | null
  customName: string | null
  room: string | null
  description: string | null
  onlineUrl: string | null
  registrationUrl: string | null
  website?: string | null
  contactEmail?: string | null
  contactInfo: Record<string, string> | null
  schedule: { frequency: string; weekday: string | null } | null
}

export interface CheckData {
  events: CheckEvent[]
  venues: { legacyId: number; street: string | null }[]
  users: { legacyId: number; name: string }[]
  registrations: {
    uuid: string
    userId: number | null
    questions: Record<string, unknown> | null
  }[]
}

export interface CheckFailure {
  rule: string
  offenders: (number | string)[]
}

/** Titles and rooms land in `maxLength: 100` columns; contact text too. */
const TEXT_MAX = 100
const URL_FIELDS = ['onlineUrl', 'registrationUrl', 'website'] as const
const EXACT_EMAIL = new RegExp(`^${EMAIL_RE.source}$`)

export function checkAtlasData(data: CheckData, groomingYear: number): CheckFailure[] {
  const failures: CheckFailure[] = []
  const rule = (name: string, offenders: (number | string)[]): void => {
    if (offenders.length) failures.push({ rule: name, offenders })
  }
  const events = data.events
  const ids = (predicate: (e: CheckEvent) => boolean) =>
    events.filter(predicate).map((e) => e.legacyId)
  const text = (e: CheckEvent) =>
    [e.customName, e.room, e.description].filter((v): v is string => typeof v === 'string')

  // ── Integrity
  const seen = new Set<number>()
  rule(
    'duplicate legacyId',
    events.map((e) => e.legacyId).filter((id) => (seen.has(id) ? true : (seen.add(id), false))),
  )
  rule(
    'excluded row present (merges.ts)',
    ids((e) => EXCLUDED_EVENT_LEGACY_IDS.has(e.legacyId)),
  )

  // ── Text hygiene
  rule(
    'invisible copy-paste characters',
    ids((e) => text(e).some(hasInvisibleJunk)),
  )
  rule(
    'carriage returns or tabs',
    ids((e) => text(e).some((v) => /[\r\t]/.test(v))),
  )
  rule(
    'styled Mathematical Alphanumeric letters',
    ids((e) =>
      text(e).some((v) =>
        [...v].some((c) => c.codePointAt(0)! >= 0x1d400 && c.codePointAt(0)! <= 0x1d7ff),
      ),
    ),
  )
  rule(
    'leading or trailing whitespace',
    ids((e) => text(e).some((v) => v !== v.trim())),
  )
  rule(
    'doubled internal whitespace',
    ids((e) => text(e).some((v) => /\S {2,}\S/.test(v))),
  )
  rule(
    'empty-string text field (use null)',
    ids((e) => text(e).some((v) => v === '')),
  )
  rule(
    'runs of blank lines',
    ids((e) => /\n{3,}/.test(e.description ?? '')),
  )
  rule(
    'HTML in description',
    ids((e) => /<\/?[a-zA-Z][^>]*>/.test(e.description ?? '')),
  )

  // ── Redundancy with structured fields
  rule(
    'link in description (belongs in a URL field)',
    ids((e) => URL_RE.test(e.description ?? '')),
  )
  rule(
    'email in description (belongs in contactEmail)',
    ids((e) => EMAIL_RE.test(e.description ?? '')),
  )
  rule(
    'stale date',
    ids(
      (e) =>
        findStaleDates(`${e.description ?? ''} ${e.customName ?? ''}`, groomingYear).length > 0,
    ),
  )

  // ── Structured fields
  rule(
    'non-daily recurrence without a weekday',
    ids((e) => ['weekly', 'monthly'].includes(e.schedule?.frequency ?? '') && !e.schedule?.weekday),
  )
  rule(
    'relative URL in a URL field',
    ids((e) =>
      URL_FIELDS.some((f) => {
        const v = e[f]
        return typeof v === 'string' && v !== '' && !/^https?:\/\//.test(v)
      }),
    ),
  )
  rule(
    'email address in a URL field',
    ids((e) =>
      URL_FIELDS.some((f) => typeof e[f] === 'string' && EXACT_EMAIL.test(e[f] as string)),
    ),
  )
  rule(
    'invalid contactEmail',
    ids((e) => !!e.contactEmail && !EXACT_EMAIL.test(e.contactEmail)),
  )
  rule(
    'title only says "meditation"',
    ids((e) => !!e.customName && GENERIC_TITLE_RE.test(e.customName.trim())),
  )
  rule(
    'text over 100 characters (title, room, contact)',
    ids((e) =>
      [e.customName, e.room, e.contactInfo?.phone_name, e.contactInfo?.phone_number].some(
        (v) => typeof v === 'string' && v.length > TEXT_MAX,
      ),
    ),
  )
  const streets = new Map(
    data.venues.map((v) => [v.legacyId, (v.street ?? '').split(',')[0].trim()]),
  )
  rule(
    'blank offline title with no street to auto-fill from',
    ids(
      (e) =>
        !e.customName && e.eventType !== 'online' && !(e.venueId != null && streets.get(e.venueId)),
    ),
  )
  rule(
    'empty-string contactInfo value',
    ids((e) => !!e.contactInfo && Object.values(e.contactInfo).some((v) => v === '')),
  )
  rule(
    'phone number in the contact-name slot',
    ids((e) => /^[\d+()\-.\s]{7,}$/.test(e.contactInfo?.phone_name ?? '')),
  )

  // ── Registrations against the user-submissions contract (#799)
  const users = new Map(data.users.map((u) => [u.legacyId, u]))
  const rejected: string[] = []
  const optIns: string[] = []
  for (const reg of data.registrations) {
    const registrant = (reg.userId != null && users.get(reg.userId)) || { name: 'Registrant' }
    const pairs = registrationSubmissionData(reg, registrant)
    if (checkSubmissionData(pairs, { type: 'registration' }).length > 0) rejected.push(reg.uuid)
    if (pairs.some((p) => p.field === SUBSCRIBE_OPT_IN)) optIns.push(reg.uuid)
  }
  rule('registration outside the submissionData bounds', rejected)
  rule('registration emitting the subscribe opt-in', optIns)

  return failures
}

/** Survivors whose removed duplicates' registrants they inherit, missing from the data. */
export function missingMergeSurvivors(events: { legacyId: number }[]): number[] {
  const present = new Set(events.map((e) => e.legacyId))
  return [...new Set(Object.values(MERGED_EVENT_TARGETS))].filter((id) => !present.has(id))
}
