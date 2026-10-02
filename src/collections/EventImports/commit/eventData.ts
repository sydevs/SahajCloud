/**
 * What the commit writes to `events` for one resolved row.
 *
 * ⚠ **The schedule is re-derived here, not carried from the resolve step.** A
 * resolved row stores only the comparison key (`resolve/resolveRow.ts`), so the
 * recurrence is rebuilt from the CSV against the row's stored `anchorDate` —
 * which is what makes "the next Tuesday" the one the reviewer approved rather
 * than the one the commit happens to run on.
 *
 * ⚠ **Nothing here validates what `Events` already validates.** A malformed
 * `onlineUrl`, a title over 100 characters: each is reported by the per-row
 * write, against that row's line. A second copy of those rules here would answer
 * differently the first time either changes.
 *
 * `registrationLimit` is the one exception, because it is the one column this
 * module has to convert. A number column cannot carry "12 people", so the
 * conversion has to happen here — and a conversion that can fail owes the
 * volunteer the failure rather than a silent "unlimited".
 */

import type { RawImportRow } from '../csv/columns'
import type { ResolvedRow } from '../resolve/resolveRow'

import { Temporal } from '@js-temporal/polyfill'

import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'
import type { Event } from '@/payload-types'

import { mapCsvSchedule } from '../csv/schedule'


export interface EventDataArgs {
  values: RawImportRow
  resolved: ResolvedRow
  /** The city or venue the placement step filed this class under. */
  regionId: number
  /**
   * The coordinator who vouches for the class, or null for an unadopted one.
   *
   * ⚠ **Null is a decision, not a missing value.** It is what publishes the
   * class `unverified` below, which is the whole reason an import may run without
   * a coordinator per row.
   */
  managerId: number | null
}

export interface EventCreateData {
  data: Record<string, unknown>
  /**
   * ⚠ **`skipVerifyHook` is true only for an unadopted class.** It means "open
   * no verification cycle", which is right with no coordinator and wrong with
   * one: an adopted class must take the same path as assigning a manager in the
   * admin, or it is stamped `verified` with no `nextCheckAt` and never comes up
   * for re-verification again (`UserSubmissions/lifecycle/review.ts`).
   */
  context: { skipVerifyHook: boolean }
}

export type EventDataResult = { ok: true } & EventCreateData | { ok: false; errors: string[] }

export function eventCreateData({
  values,
  resolved,
  regionId,
  managerId,
}: EventDataArgs): EventDataResult {
  const schedule = mapCsvSchedule({
    scheduleType: values.scheduleType,
    date: values.date,
    startTime: values.startTime,
    endTime: values.endTime,
    weekdays: values.weekdays,
    interval: values.interval,
    monthWeek: values.monthWeek,
    untilDate: values.untilDate,
    timezone: resolved.timezone,
    today: Temporal.PlainDate.from(resolved.anchorDate),
  })
  // The resolve step already mapped this row's schedule and refused it on
  // failure, so reaching here means the CSV changed under the batch — which is
  // a row error, not a reason to drop the rest of the chunk.
  if (!schedule.ok) return { ok: false, errors: schedule.errors }

  const limit = registrationLimitOf(values.registrationLimit)
  if (!limit.ok) return { ok: false, errors: [limit.error] }

  const eventType: Event['eventType'] = values.eventType === 'online' ? 'online' : 'offline'
  const data: Record<string, unknown> = {
    // An empty string, never null: `eventTitleBeforeChange` keeps the existing
    // title for a nullish value, and falls through to the "<time of day>
    // Meditation at <place>" auto-fill for '' — which also translates itself,
    // unlike a hand-written name (`Events.ts`).
    title: values.title?.trim() || '',
    languages: resolved.languages,
    description: plainTextToLexical(values.description) ?? null,
    website: values.website?.trim() || null,
    contactName: values.contactName?.trim() || null,
    contactPhone: values.contactPhone?.trim() || null,
    contactEmail: values.contactEmail?.trim() || null,
    region: regionId,
    eventType,
    onlineUrl: eventType === 'online' ? values.onlineUrl?.trim() || null : null,
    ...(eventType === 'offline' ? { address: addressFor(values, resolved) } : {}),
    inactive: resolved.inactive,
    ...(schedule.inactive ? {} : { schedule: schedule.schedule }),
    // Always `sahaj-atlas`, unverified rows included: a registrant's confirm or
    // deny is what feeds `confidenceScore`, so routing an unadopted class
    // elsewhere would remove the one signal that it is real (#828).
    registrationMode: 'sahaj-atlas',
    registrationLimit: limit.value,
    manager: managerId,
    // With a coordinator the stage is left to `syncVerificationOnSave`, which
    // adopts the class on their own cadence. Without one it is stated, because
    // the hook is skipped and nothing else would set it.
    ...(managerId === null ? { verificationStage: 'unverified' } : {}),
    _status: 'published',
  }
  return { ok: true, data, context: { skipVerifyHook: managerId === null } }
}

/**
 * The offline address, composed from the CSV and the geocode together.
 *
 * ⚠ **The point comes from `resolved`, the text from the CSV.** The resolve step
 * may have taken the row's own coordinates over the geocode's
 * (`resolve/resolveRow.ts`), so reading the pair back off `values` here would
 * silently re-decide which point won. The street, by contrast, is what the
 * volunteer wrote — Mapbox's normalisation of it is not what a seeker was given.
 */
function addressFor(values: RawImportRow, resolved: ResolvedRow): Record<string, unknown> {
  return {
    mapboxId: resolved.mapboxId,
    venueName: values.venueName?.trim() || null,
    street: values.address?.trim() || null,
    room: values.room?.trim() || null,
    postCode: values.postcode?.trim() || null,
    country: values.country?.trim().toUpperCase() || null,
    // ⚠ **The geocode's subdivision wins over the CSV's `state`.** The column
    // holds an ISO 3166-2 shortCode (`src/fields/addressFields.ts`), and the
    // volunteer's column is a free-text name — "Bavaria" where the column wants
    // `BY`. The CSV value is kept only where the geocode named no subdivision,
    // and `Events` refuses it there rather than publishing a name as a code.
    region: resolved.subdivisionCode ?? values.state?.trim() ?? null,
    city: cityFor(values, resolved),
    latitude: resolved.latitude,
    longitude: resolved.longitude,
  }
}

/**
 * ⚠ **The volunteer's city wins over Mapbox's.** The address is what a seeker
 * reads, and `placeName` is the metro Mapbox filed the row under — so a class in
 * a suburb would be addressed to the city centre it merged into
 * (`propose/cluster.ts`). The place name is the fallback for a row that gave no
 * city, which only an online row can be.
 */
function cityFor(values: RawImportRow, resolved: ResolvedRow): string | null {
  return values.city?.trim() || resolved.placeName || null
}

/**
 * The registration cap, `null` for unlimited, or the reason it cannot be read.
 *
 * ⚠ **`Number`, never `parseInt`.** `parseInt('12 people')` is 12, so the loose
 * reader turns a column the volunteer got wrong into a cap they never set — and
 * a class that silently stops taking registrations at 12 is the kind of defect
 * nobody reports for months. An empty column is the documented "unlimited"
 * (`csv/columns.ts`); anything else that is not a whole count is refused.
 */
function registrationLimitOf(
  value: string | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value?.trim()
  if (!trimmed) return { ok: true, value: null }
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed >= 0
    ? { ok: true, value: parsed }
    : { ok: false, error: `registrationLimit must be a whole number of places (got "${trimmed}")` }
}
