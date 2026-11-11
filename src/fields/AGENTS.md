# Fields

Field factories are covered by the collections-and-fields rules — see [`src/collections/AGENTS.md`](../collections/AGENTS.md). This guide holds what belongs to one factory.

## Secret field

`secretField()` (`src/fields/secretField.ts`) is a text column holding an
operator's credential: `read: () => false`, `admin.disabled`, and encrypted at
rest through `payload.encrypt` / `payload.decrypt`. Reach for it whenever this
service stores a third party's secret. `Clients.mailingList.apiKey` is the one
consumer today (#1109).

Three things it does, and one it refuses:

- **Nobody reads it through the API.** Every consumer reads with
  `overrideAccess: true`, which skips field access while still running the
  decrypt. `admin.disabled` is the other half: the value is in no form state,
  so Payload's live preview posts none of it to the iframe and a form save
  carries no copy to write back.
- ⚠ **`''`, `null` and `undefined` pass through untouched, both ways.** A query
  telling a filled column from a blank one tests `not_equals: ''`
  (`LIST_ELIGIBLE`, `src/lib/atlas/mailingListOwners.ts`), and ciphertext for
  `''` is a non-empty string — so encrypting the empty case would offer a
  half-configured service as a region's mailing-list owner.
- ⚠ **A failed decrypt reports through `capture` and answers `null`.** A throw
  inside `afterRead` would take down every read of the row.
- **It owns no admin control**, because a credential is entered beside whatever
  else its provider needs. `Clients` holds that one
  (`src/components/admin/MailingListKey/`), and a second consumer is what would
  make a shared one worth building.

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

## Why rrule-temporal (not rrule)

Legacy `rrule` (v2.8.1) has a [double-timezone-conversion
bug](https://github.com/jkbrzt/rrule/issues/355): its `dateInTimeZone()`
treats `dtstart`'s UTC slot values as real UTC and applies the timezone
offset again, producing environment-dependent results. `rrule-temporal`
handles timezones natively via `Temporal.ZonedDateTime`, eliminating this
class of bugs entirely.
