import { rawTimeZones } from '@vvo/tzdb'
import { defaultTimezones } from 'payload/shared'

export interface TimezoneOption {
  label: string
  value: string
}

/**
 * The full IANA timezone set, sourced deterministically from the **pinned**
 * `@vvo/tzdb` package (its bundled tz database). We do NOT use
 * `Intl.supportedValuesOf('timeZone')`: every `timezone: true` companion field
 * bakes a Postgres enum from this list,
 * so it MUST be identical on the machine that generates the migration and on
 * every runtime — and `Intl` varies with the host's ICU version (e.g.
 * `Asia/Calcutta` vs `Asia/Kolkata`). A pinned package is identical everywhere.
 *
 * Built once at module load: Payload's curated `defaultTimezones` first (keeping
 * their friendly labels), then every `@vvo/tzdb` zone **and its aliases** — so
 * legacy IANA names the Atlas data uses (`Europe/Kiev`, `Australia/Melbourne`,
 * `America/Belem`, …) resolve, not just the canonical `Europe/Kyiv` /
 * `Australia/Sydney`. Bumping `@vvo/tzdb` widens the enums → needs a migration.
 *
 * ⚠ **The order is schema too, so take it from neither the host nor the clock**
 * (#722). Sort on `rawOffsetInMinutes`, fixed for a zone, and read the static
 * `rawTimeZones`. `getTimeZones()` fails both: it sorts on
 * `currentTimeOffsetInMinutes`, which every DST boundary moves, and it resolves
 * each zone through `Intl`, silently dropping any the host's ICU cannot format.
 *
 * `tests/unit/timezone-options.spec.ts` pins both membership and order.
 */
export const SUPPORTED_TIMEZONES: TimezoneOption[] = (() => {
  const byValue = new Map<string, TimezoneOption>()
  // `@vvo/tzdb` omits plain `UTC`; seed it as a first-class option.
  byValue.set('UTC', { label: '(UTC+00:00) Coordinated Universal Time', value: 'UTC' })
  for (const { label, value } of defaultTimezones) {
    if (!byValue.has(value)) byValue.set(value, { label, value })
  }
  // Compare code units, never `localeCompare` — collation varies with the host's
  // ICU version, the same dependency this module exists to avoid.
  const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const zones = [...rawTimeZones].sort(
    (a, b) => a.rawOffsetInMinutes - b.rawOffsetInMinutes || byName(a.name, b.name),
  )
  for (const zone of zones) {
    for (const value of [zone.name, ...zone.group]) {
      if (!byValue.has(value)) byValue.set(value, { label: zone.rawFormat, value })
    }
  }
  // `@vvo/tzdb` also omits the POSIX `Etc/GMT*` zones (the Atlas registrations
  // carry e.g. `Etc/GMT-3`). Add the full range. POSIX inverts the sign in the
  // **name**: `Etc/GMT-3` is UTC+3. So the loop counter names the zone and its
  // negation is the real offset the label states (#729).
  for (let posix = -14; posix <= 12; posix++) {
    const value = posix === 0 ? 'Etc/GMT' : `Etc/GMT${posix < 0 ? posix : `+${posix}`}`
    const utcOffset = -posix
    const sign = utcOffset >= 0 ? '+' : '-'
    const hh = String(Math.abs(utcOffset)).padStart(2, '0')
    if (!byValue.has(value)) byValue.set(value, { label: `(UTC${sign}${hh}:00) ${value}`, value })
  }
  return [...byValue.values()]
})()
