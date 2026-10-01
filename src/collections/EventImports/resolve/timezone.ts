/**
 * The timezone a row's coordinates sit in, narrowed to what the column stores.
 *
 * ⚠ **The zone has to come from the coordinates, not from the country.** A
 * country cannot answer it at all for the dozen countries spanning several
 * zones, and `scheduleFields` writes every recurrence against this one value —
 * so a wrong zone moves a class by hours and no later read can tell.
 *
 * The lookup is offline, against `tz-lookup`'s bundled boundary data: a per-row
 * HTTP call would add a second network dependency to the resolve step for an
 * answer that never changes.
 */

import tzlookup from 'tz-lookup'

import { isSupportedTimezone } from '@/lib/timezones'
import type { SupportedTimezones } from '@/payload-types'

export type DeriveTimezoneResult =
  | { ok: true; timezone: SupportedTimezones }
  /** Shown to the volunteer as the row's error. */
  | { ok: false; error: string }

/**
 * The zone for a point, or the reason the row cannot carry one.
 *
 * The row's own `timezone` column overrides the lookup and is narrowed by the
 * same test: a volunteer correcting a border case must not be able to write a
 * value the enum lacks either.
 */
export function deriveImportTimezone(args: {
  latitude: number
  longitude: number
  override?: string
}): DeriveTimezoneResult {
  let zone = args.override?.trim()

  if (!zone) {
    try {
      zone = tzlookup(args.latitude, args.longitude)
    } catch {
      return { ok: false, error: `no timezone covers ${args.latitude}, ${args.longitude}` }
    }
  }

  // ⚠ **`isSupportedTimezone` is the gate for both paths.** `firstDate_tz` is a
  // Postgres enum baked from the same list, so a zone missing from it is a row
  // the database refuses at write — the failure this turns into a reported line
  // number. A looked-up zone reaching here is a tzdb version gap rather than a
  // bad row, which is why the message names the zone: that is what tells a
  // maintainer to bump `@vvo/tzdb` and migrate the enum instead of editing CSV.
  return isSupportedTimezone(zone)
    ? { ok: true, timezone: zone }
    : { ok: false, error: `timezone "${zone}" is not one this CMS stores` }
}
