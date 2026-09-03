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
 * Pure by design: no Payload types, no request, no logging. `@/plugins/databaseErrors`
 * answers with it on Payload's own REST routes, `@/plugins/sentry` asks it whether an
 * error is a caller's mistake before reporting an incident, and a custom endpoint that
 * catches its own errors calls it directly. The reasoning — why the error is matched
 * rather than the query pre-validated, and what the seam does and does not reach — is in
 * `docs/architecture.md`; the decision that `lesson` (not `Path`) is the in-code name is
 * on sydevs/SahajCloud#670.
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
 * Drizzle wraps every failed query in a `DrizzleQueryError` (`drizzle-orm/pg-core/session.js`)
 * keeping `pg`'s `DatabaseError` — and with it the SQLSTATE — on `cause`, so the chain is
 * walked rather than the message matched.
 *
 * ⚠ **Match the code; never stop at the first error that carries one.** Anything between
 * Payload and the driver may set a `code` of its own (a `SystemError` such as
 * `ECONNRESET`), and stopping there is silent — no 22P02 found, the 500 comes back.
 * The `ECONNRESET` decoy in `tests/unit/postgres-cast-error.spec.ts` pins it.
 *
 * Returns `null` rather than throwing on a cycle or a non-error — this runs on the error
 * path, where a second failure would replace a bad response with no response at all.
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
 * `{ status, message }` when this error is a Postgres cast failure, `null` otherwise — in
 * which case nothing about the error's handling changes.
 *
 * The message names the offending value because Postgres does, and that is the whole
 * point of the 400: the caller can see what it sent. It names the Postgres *type*
 * (`enum_meditations_type`) rather than the field, because SQLSTATE 22P02 carries the
 * type and not the column — a worse-worded 400 that cannot miss a case, rather than a
 * better-worded one that only covers enums.
 */
export function mapPostgresCastError(error: unknown): MappedClientError | null {
  const postgresError = findPostgresError(error, INVALID_TEXT_REPRESENTATION)
  if (!postgresError) return null

  return {
    message: `Invalid value in request: ${postgresError.message}`,
    status: 400,
  }
}
