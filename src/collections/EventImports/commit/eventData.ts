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
 * module converts rather than copies — see `registrationLimitOf`.
 */

import type { RawImportRow } from '../csv/columns'
import type { ResolvedRow } from '../resolve/resolveRow'

import { newListingAdoption } from '@/lib/eventVerification'
import { subdivisionCodeFor } from '@/lib/geography'
import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'
import type { Event } from '@/payload-types'

import { mapCsvSchedule, parseIsoDate, scheduleArgsFor } from '../csv/schedule'

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
  /** `newListingAdoption`'s, verbatim — the two halves are one decision. */
  context: { skipVerifyHook: boolean }
}

export type EventDataResult = ({ ok: true } & EventCreateData) | { ok: false; errors: string[] }

export function eventCreateData({
  values,
  resolved,
  regionId,
  managerId,
}: EventDataArgs): EventDataResult {
  // ⚠ **Read with the CSV's own strict reader, not a looser one.** `anchorDate`
  // is a bare `z.string()` in the column (`EventImports.ts`), and reading it
  // more loosely than the `date` column it was derived from would accept a shape
  // no row could have carried.
  const anchor = parseIsoDate(resolved.anchorDate)
  if (!anchor) {
    return { ok: false, errors: ["this row's resolved date is unreadable — resolve it again"] }
  }

  const schedule = mapCsvSchedule(scheduleArgsFor(values, resolved.timezone, anchor))
  // The resolve step refused this row's schedule already, so nothing reaching
  // here should fail — but a `MapScheduleResult` is a result either way, and
  // asserting otherwise would drop the rest of the chunk over one row.
  if (!schedule.ok) return { ok: false, errors: schedule.errors }

  const limit = registrationLimitOf(values.registrationLimit)
  if (!limit.ok) return { ok: false, errors: [limit.error] }

  // The stage and the context flag together, because they are one decision
  // (`@/lib/eventVerification/adoption`) — and the import is not the only writer
  // that creates a listing from somebody else's data.
  const adoption = newListingAdoption(managerId)
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
    // Both read off the mapper just run, never off `resolved.inactive` as well:
    // one fact with two sources is one that can disagree, and this pairing is
    // what `Events` validates against — a dormant class carries no schedule and
    // owes a contact route instead.
    inactive: schedule.inactive,
    ...(schedule.inactive ? {} : { schedule: schedule.schedule }),
    // Always `sahaj-atlas`, unverified rows included: a registrant's confirm or
    // deny is what feeds `confidenceScore`, so routing an unadopted class
    // elsewhere would remove the one signal that it is real (#828).
    registrationMode: 'sahaj-atlas',
    registrationLimit: limit.value,
    manager: managerId,
    ...adoption.data,
    _status: 'published',
  }
  return { ok: true, data, context: adoption.context }
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
    // ⚠ **The geocode's subdivision wins, and the CSV's is converted, never
    // copied.** The column holds an ISO 3166-2 shortCode
    // (`src/fields/addressFields.ts`) and nothing validates it — a plain `text`
    // field with no `validate` — so a free-text "Bavaria" written here publishes
    // where `BY` is expected and no save refuses it.
    region: resolved.subdivisionCode || subdivisionCodeOf(values) || null,
    // Required of every offline row, which is the only kind that gets an
    // address (`csv/columns.ts`), so the parser has already refused a blank.
    city: values.city?.trim() || null,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
  }
}

/**
 * The CSV's `state` as the column's own vocabulary, or null.
 *
 * ⚠ **Matched against `getRegionOptions`, which is the column's own source** —
 * the same table `StringSelectField` fills the address dropdown from. Both sides
 * of an option are tried, because the volunteer may type either: the code
 * (`BY`), or the name exactly as ISO lists it.
 *
 * ⚠ **ISO lists the endonym, so an English exonym does not match.** `DE` holds
 * `Bayern`, never `Bavaria`, and this is why the geocode's own
 * `subdivisionCode` is preferred rather than merely checked first. Unplaceable
 * becomes null, not the name: the column's documented job is to sharpen the
 * geocode where a city name repeats (`csv/columns.ts`), and the geocode is what
 * fills the address.
 */
function subdivisionCodeOf(values: RawImportRow): string | null {
  return subdivisionCodeFor(values.country, values.state)
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
