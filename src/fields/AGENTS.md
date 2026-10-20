# Fields

Field factories are covered by the collections-and-fields rules — see [`src/collections/AGENTS.md`](../collections/AGENTS.md). This guide holds what belongs to one factory.

## Schedule field

`scheduleFields()` (`src/fields/scheduleFields.ts`) is a Group field with
native sub-fields stored in individual DB columns. The `firstDate` field
uses `timezone: true`, which stores the datetime in UTC and auto-creates a
companion `firstDate_tz` for the IANA timezone. Used by **Events** and
**AppCards**, so a change here lands on both (and on their version tables).

One **stored** derived column, recomputed on every write (#603):

- **`lastDate`** (date, indexed, `admin.hidden`) — the end of the final
  occurrence's **local** day (23:59:59.999 in `firstDate_tz`) as a UTC
  instant, or `null` when the recurrence never ends. Computed by the
  `computeLastDate` `beforeChange` field hook from the pure
  `lastOccurrenceEnd()`. The column is just that function's DB-queryable
  projection. A real column, rather than a virtual field, so "has this
  schedule run out?" can appear in a `where` — the public event feeds
  filter on it (see `docs/rules/api-clients.md`).

  Two things to know if you touch it:
  - **Termination is read off the built rule's own `options()`**, not
    re-derived from the sub-fields, so it can't drift from
    `buildRRuleTemporal`'s conditions (a positive `count`, a parseable
    `untilDate`). An open-ended rule returns `null` _before_ `all()` is
    called — `all()` on an infinite rule would run to its iteration cap.
  - **The partial-update trap.** A field `beforeChange` hook receives only
    the incoming patch, and Payload materializes an empty `{}` for a
    group the patch omits — so computing from `siblingData` alone would
    NULL the column on every unrelated write. `computeLastDate` computes
    from `{ ...previousSiblingDoc, ...siblingData }`: a partial schedule
    patch recomputes correctly, an unrelated patch is a no-op, and any
    write back-fills a NULL for free. Spread, not deep merge — an
    explicit `null` in the patch (a cleared `recurrenceType`) must win.

  Existing rows are brought up to date by
  `scripts/backfill-schedule-last-date.ts`.

## Why rrule-temporal (not rrule)

Legacy `rrule` (v2.8.1) has a [double-timezone-conversion
bug](https://github.com/jkbrzt/rrule/issues/355): its `dateInTimeZone()`
treats `dtstart`'s UTC slot values as real UTC and applies the timezone
offset again, producing environment-dependent results. `rrule-temporal`
handles timezones natively via `Temporal.ZonedDateTime`, eliminating this
class of bugs entirely.
