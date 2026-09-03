import { describe, expect, it } from 'vitest'

import {
  findPostgresError,
  INVALID_TEXT_REPRESENTATION,
  mapPostgresCastError,
} from '@/lib/databaseErrors'

/**
 * The pure half of sydevs/SahajCloud#670.
 *
 * The **fixture assumption**, stated before it was written: a failing query
 * reaches an `afterError` hook as a `DrizzleQueryError` whose message is
 * `Failed query: …` and whose `cause` is `pg`'s `DatabaseError`, carrying
 * `code: '22P02'`. Verified against the real thing twice — in drizzle-orm
 * 0.45.2's own `errors.js` (`DrizzleQueryError` assigns `this.cause = cause`)
 * and `pg-core/session.js:41` (every failed query is rethrown wrapped) — and then
 * empirically, against a real Postgres, in
 * `tests/int/database-cast-errors.int.spec.ts`, which is where the shape is
 * pinned rather than assumed.
 */

/** The shape drizzle throws: a wrapper whose `cause` is the driver's error. */
const drizzleWrapped = (cause: unknown): Error => {
  const error = new Error('Failed query: select "meditations"."id" …\nparams: path')
  ;(error as Error & { cause?: unknown }).cause = cause
  return error
}

/** The shape `pg` throws. Only `code` and `message` are read. */
const postgresError = (code: string, message: string) => Object.assign(new Error(message), { code })

const ENUM_FAILURE = 'invalid input value for enum enum_meditations_type: "path"'
const INTEGER_FAILURE = 'invalid input syntax for type integer: "NaN"'

describe('findPostgresError', () => {
  it('finds the driver error one level down, under drizzle’s wrapper', () => {
    const cause = postgresError(INVALID_TEXT_REPRESENTATION, ENUM_FAILURE)

    expect(findPostgresError(drizzleWrapped(cause), INVALID_TEXT_REPRESENTATION)).toBe(cause)
  })

  it('finds it at the top level, when nothing wrapped it', () => {
    const error = postgresError('23505', 'duplicate key value violates unique constraint')

    expect(findPostgresError(error, '23505')).toBe(error)
  })

  it('walks PAST an intermediate error that carries a code of its own', () => {
    // The failure this guards: stopping at the first object with a `code`
    // rather than the first with the code asked for. A `SystemError`
    // (`ECONNRESET`) or any wrapper that sets one would hide the 22P02
    // underneath it, and the caller would get back the 500 this module exists
    // to remove — silently, since nothing in the chain is ours to constrain.
    const driver = postgresError(INVALID_TEXT_REPRESENTATION, ENUM_FAILURE)
    const decoy = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    ;(decoy as Error & { cause?: unknown }).cause = driver

    expect(findPostgresError(drizzleWrapped(decoy), INVALID_TEXT_REPRESENTATION)).toBe(driver)
    expect(mapPostgresCastError(drizzleWrapped(decoy))?.status).toBe(400)
  })

  it('returns null for an error carrying no driver code at any depth', () => {
    expect(
      findPostgresError(drizzleWrapped(new Error('connection terminated')), INVALID_TEXT_REPRESENTATION),
    ).toBeNull()
  })

  it('returns null rather than hanging on a cause cycle', () => {
    const a = new Error('a') as Error & { cause?: unknown }
    const b = new Error('b') as Error & { cause?: unknown }
    a.cause = b
    b.cause = a

    expect(findPostgresError(a, INVALID_TEXT_REPRESENTATION)).toBeNull()
  })

  it('gives up past the depth bound instead of walking forever', () => {
    // 12 wrappers, then the driver error — beyond MAX_CAUSE_DEPTH (10).
    let error: unknown = postgresError(INVALID_TEXT_REPRESENTATION, ENUM_FAILURE)
    for (let i = 0; i < 12; i++) error = drizzleWrapped(error)

    expect(findPostgresError(error, INVALID_TEXT_REPRESENTATION)).toBeNull()
  })

  it('returns null for a non-object', () => {
    expect(findPostgresError('not an error', INVALID_TEXT_REPRESENTATION)).toBeNull()
    expect(findPostgresError(null, INVALID_TEXT_REPRESENTATION)).toBeNull()
    expect(findPostgresError(undefined, INVALID_TEXT_REPRESENTATION)).toBeNull()
  })
})

describe('mapPostgresCastError', () => {
  it('answers 400 for the live enum failure, naming the value the caller sent', () => {
    const mapped = mapPostgresCastError(
      drizzleWrapped(postgresError(INVALID_TEXT_REPRESENTATION, ENUM_FAILURE)),
    )

    expect(mapped).toEqual({
      message: `Invalid value in request: ${ENUM_FAILURE}`,
      status: 400,
    })
  })

  it('answers 400 for the live integer failure too — 22P02 is not enum-specific', () => {
    const mapped = mapPostgresCastError(
      drizzleWrapped(postgresError(INVALID_TEXT_REPRESENTATION, INTEGER_FAILURE)),
    )

    expect(mapped?.status).toBe(400)
    expect(mapped?.message).toContain('"NaN"')
  })

  it('leaves a different SQLSTATE alone, so a genuine 500 stays a 500', () => {
    const unique = drizzleWrapped(
      postgresError('23505', 'duplicate key value violates unique constraint "clients_pkey"'),
    )
    const notNull = drizzleWrapped(
      postgresError('23502', 'null value in column "title" violates not-null constraint'),
    )

    expect(mapPostgresCastError(unique)).toBeNull()
    expect(mapPostgresCastError(notNull)).toBeNull()
  })

  it('leaves an error with no driver code alone', () => {
    expect(mapPostgresCastError(new Error('Something went wrong.'))).toBeNull()
  })

  it('does not match on the message alone — the code is what decides', () => {
    // Same words, no SQLSTATE: a log line or a wrapped message must not become a 400.
    expect(mapPostgresCastError(new Error(ENUM_FAILURE))).toBeNull()
  })
})
