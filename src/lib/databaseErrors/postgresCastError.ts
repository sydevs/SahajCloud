/**
 * Recognising a Postgres cast failure, and deciding what to answer for it.
 *
 * A caller-supplied value that Postgres cannot cast to a column's type raises
 * SQLSTATE **`22P02` (`invalid_text_representation`)**, and until this module
 * existed every one of them surfaced as a `500`. Two are live in production and
 * are the same error class one type apart:
 *
 *   - `invalid input value for enum enum_meditations_type: "path"`
 *     on `GET /api/meditations?where[type][equals]=path`
 *   - `invalid input syntax for type integer: "NaN"`
 *     on `GET /api/lectures/daily_fallback_shri_mataji_clip`
 *
 * This is a diagnosability problem rather than a load one: a `500` tells the
 * caller nothing, so the first has fired unchanged since June, and 300-odd
 * events of "the server broke" are noise in a channel where a 500 is meant to
 * mean *wake someone*. See sydevs/SahajCloud#670.
 *
 * The `Path`/`lesson` mismatch behind the first one stays as it is: `lesson` is
 * the in-code name for a Path step, and sending the label is the client's
 * mistake — which the 400 now says out loud. Decided on #670 rather than left
 * open, so a future reader does not re-open it.
 *
 * ## Why the error is matched here rather than the query validated up front
 *
 * The database is already making this judgement, correctly and precisely, at
 * the moment it matters. Pre-validating client `where` values against per-field
 * option sets would only reach the 51 `select` fields — so it would fix the
 * enum instance and leave the integer one firing — and it would re-derive per
 * request what one `afterError` handler covers for every enum, every id cast
 * and every date cast, present and future.
 *
 * ## Why the driver error is reached through `cause`
 *
 * Drizzle wraps every failed query in a `DrizzleQueryError` whose message is
 * `Failed query: …` (`drizzle-orm/pg-core/session.js`), keeping the `pg`
 * `DatabaseError` — and with it the SQLSTATE — on `cause`. Nothing above
 * re-reads that code, so the chain is walked rather than the message matched.
 *
 * Pure by design: no Payload types, no request, no logging. The plugin in
 * `@/plugins/databaseErrors` answers with it, and `@/plugins/sentry` asks it
 * whether an error is a caller's mistake before reporting an incident.
 */

/** SQLSTATE `22P02` — `invalid_text_representation`. */
export const INVALID_TEXT_REPRESENTATION = '22P02'

/** How far down the `cause` chain to look. Drizzle adds one level; allow for more. */
const MAX_CAUSE_DEPTH = 10

/** The subset of `pg`'s `DatabaseError` this module reads. */
export type PostgresErrorLike = {
  code: string
  message: string
}

/** What a recognised cast failure should be answered with. */
export type MappedClientError = {
  message: string
  status: number
}

const isPostgresErrorLike = (value: unknown): value is PostgresErrorLike =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { code?: unknown }).code === 'string' &&
  typeof (value as { message?: unknown }).message === 'string'

/**
 * The first error in `error`'s `cause` chain whose driver `code` is `code`.
 *
 * ⚠ **It matches the code rather than stopping at the first error that has
 * one.** Those differ the moment anything between Payload and the driver
 * carries a `code` of its own — a `SystemError` (`ECONNRESET`), a wrapper that
 * sets one — and the difference is silent: the search would stop one level too
 * high, report no 22P02, and hand the caller back the 500 this module exists to
 * remove. Nothing in the chain is ours, so "the only thing with a code is the
 * driver" is an assumption about somebody else's library, not an invariant.
 *
 * Returns `null` rather than throwing on a cycle or a non-error — this runs on
 * the error path, where a second failure would replace a bad response with no
 * response at all.
 */
export function findPostgresError(error: unknown, code: string): null | PostgresErrorLike {
  const seen = new Set<unknown>()
  let current = error

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (current === null || typeof current !== 'object' || seen.has(current)) return null
    if (isPostgresErrorLike(current) && current.code === code) return current
    seen.add(current)
    current = (current as { cause?: unknown }).cause
  }

  return null
}

/**
 * `{ status, message }` when this error is a Postgres cast failure, `null`
 * otherwise — in which case nothing about the error's handling changes.
 *
 * The message names the offending value because Postgres does, and that is the
 * whole point of the 400: the caller can see what it sent. It names the
 * Postgres *type* (`enum_meditations_type`) rather than the field, because
 * SQLSTATE 22P02 carries the type and not the column — a worse-worded 400 that
 * cannot miss a case, rather than a better-worded one that only covers enums.
 */
export function mapPostgresCastError(error: unknown): MappedClientError | null {
  const postgresError = findPostgresError(error, INVALID_TEXT_REPRESENTATION)
  if (!postgresError) return null

  return {
    message: `Invalid value in request: ${postgresError.message}`,
    status: 400,
  }
}
