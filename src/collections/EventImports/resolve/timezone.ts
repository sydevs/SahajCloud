/**
 * The timezone a row's coordinates sit in, narrowed to what the column stores.
 *
 * ⚠ **The zone has to come from the coordinates, not from the country.** A
 * country cannot answer it at all for the dozen countries spanning several
 * zones, and `scheduleFields` writes every recurrence against this one value —
 * so a wrong zone moves a class by hours and no later read can tell.
 *
 * The lookup is offline, against `@photostructure/tz-lookup`'s bundled boundary
 * data: a per-row HTTP call would add a second network dependency to the
 * resolve step for an answer that never changes. It is that fork rather than
 * `tz-lookup` because the original's data is years stale — it puts Ciudad
 * Juárez in `America/Ojinaga`, an hour out for half the year.
 */

import { Temporal } from '@js-temporal/polyfill'
import tzlookup from '@photostructure/tz-lookup'

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
 *
 * ⚠ **An override may rename the point's clock, never move it.** It is for the
 * border case — a class that keeps the next town's zone name — so it has to
 * keep the point's UTC offset, summer and winter. One that does not is a typo
 * or a copied row, and accepting it publishes the class hours out.
 */
export function deriveImportTimezone(args: {
  latitude: number
  longitude: number
  override?: string
}): DeriveTimezoneResult {
  const override = args.override?.trim()
  const atPoint = zoneAt(args.latitude, args.longitude)

  if (!override) {
    if (!atPoint) {
      return { ok: false, error: `no timezone covers ${args.latitude}, ${args.longitude}` }
    }
    // ⚠ **`isSupportedTimezone` is the gate for both paths.** `firstDate_tz` is
    // a Postgres enum baked from the same list, so a zone missing from it is a
    // row the database refuses at write — the failure this turns into a
    // reported line number. A looked-up zone reaching here is a tzdb version
    // gap rather than a bad row, which is why the message names the zone: that
    // is what tells a maintainer to bump `@vvo/tzdb` and migrate the enum
    // instead of editing CSV.
    return isSupportedTimezone(atPoint)
      ? { ok: true, timezone: atPoint }
      : { ok: false, error: `timezone "${atPoint}" is not one this CMS stores` }
  }

  if (!isSupportedTimezone(override)) {
    return { ok: false, error: `timezone "${override}" is not one this CMS stores` }
  }
  if (atPoint && !sameClock(override, atPoint)) {
    return {
      ok: false,
      error: `timezone "${override}" does not match the location, which is in ${atPoint} — correct the timezone column or leave it blank`,
    }
  }
  return { ok: true, timezone: override }
}

/** The zone covering a point, or null — the lookup throws for one out of range. */
function zoneAt(latitude: number, longitude: number): string | null {
  try {
    return tzlookup(latitude, longitude)
  } catch {
    return null
  }
}

/**
 * Whether two zones keep the same UTC offset this year, in winter and summer.
 *
 * Both seasons, because a zone without daylight saving matches its neighbour
 * for half the year — Phoenix is Denver's clock until March.
 */
function sameClock(a: string, b: string): boolean {
  const { year } = Temporal.Now.plainDateISO('UTC')
  try {
    return [1, 7].every((month) => {
      const instant = Temporal.ZonedDateTime.from({ year, month, day: 15, timeZone: 'UTC' })
      return (
        instant.withTimeZone(a).offsetNanoseconds === instant.withTimeZone(b).offsetNanoseconds
      )
    })
  } catch {
    // A zone the runtime's ICU data does not know cannot be compared, and
    // refusing the row for it would blame the volunteer for our data.
    return true
  }
}
