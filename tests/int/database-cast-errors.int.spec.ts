import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  findPostgresError,
  INVALID_TEXT_REPRESENTATION,
  mapPostgresCastError,
} from '@/lib/databaseErrors'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The half of sydevs/SahajCloud#670 that only a real database can answer.
 *
 * `tests/unit/postgres-cast-error.spec.ts` covers the mapping against a fixture
 * of the error shape. A fixture cannot tell you the shape is right — and the
 * shape was the ticket's one unverified premise, because drizzle wraps every
 * failed query and the Sentry payloads that reported these 500s carry no
 * driver `code` at all.
 *
 * So this spec makes Postgres reject a real query, catches what actually
 * arrives, and asserts the SQLSTATE survives the wrapping. If a drizzle or
 * `pg` upgrade stops preserving `cause`, this goes red and the 500s come back
 * — which is exactly the failure a fixture-only suite would sleep through.
 *
 * It asserts the mapper against the caught error rather than through an HTTP
 * request: `afterError` runs in `payload/dist/utilities/routeError.js`, which
 * is REST-only, and this lane has no REST client. What is unverified here — that
 * Payload calls the hook and returns its status — is read off that file in
 * `src/plugins/databaseErrors/databaseErrorPlugin.ts`, and observable on the
 * PR's preview with the two `curl`s in the ticket.
 */
describe('Postgres cast failures (SQLSTATE 22P02)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  /** Run something expected to throw, and hand back what it threw. */
  const thrownBy = async (run: () => Promise<unknown>): Promise<unknown> => {
    try {
      await run()
    } catch (error) {
      return error
    }
    throw new Error('expected the query to fail, but it succeeded')
  }

  it('the live enum case reaches us with 22P02 intact, and maps to a 400', async () => {
    // `meditations.type` is labelled "Path" and stored as `lesson`
    // (src/collections/Meditations/Meditations.ts), so a caller reading the
    // admin UI sends `path` — the exact production query behind Sentry 126185460.
    const error = await thrownBy(() =>
      payload.find({
        collection: 'meditations',
        where: { type: { equals: 'path' } },
      }),
    )

    const postgresError = findPostgresError(error, INVALID_TEXT_REPRESENTATION)
    expect(postgresError).not.toBeNull()
    expect(postgresError?.message).toContain('enum_meditations_type')

    expect(mapPostgresCastError(error)).toEqual({
      message: expect.stringContaining('"path"'),
      status: 400,
    })
  })

  it('the integer case does too — the mapping is not enum-specific', async () => {
    // Sentry 136881789 — `GET /api/lectures/daily_fallback_shri_mataji_clip`
    // → `invalid input syntax for type integer: "NaN"` — answered 400 under
    // payload 3.90.2 and answers 404 under 3.92.1, which refuses a non-finite
    // id in `findByID` before any SQL (`isValidID`). Both measured, through
    // `handleEndpoints` against each installed version.
    //
    // ⚠ So this case pins the WRAPPING, not a live path: that a 22P02 on an
    // integer column still survives drizzle intact. The enum case above is the
    // live one. A numeric NaN in a `where` is the one way left in — `findByID`
    // refuses one, and a string in a `where` on `id` is dropped, not cast.
    const error = await thrownBy(() =>
      payload.find({
        collection: 'lectures',
        where: { id: { equals: NaN } },
      }),
    )

    const postgresError = findPostgresError(error, INVALID_TEXT_REPRESENTATION)
    expect(postgresError).not.toBeNull()
    expect(postgresError?.message).toContain('invalid input syntax for type integer')
    expect(mapPostgresCastError(error)?.status).toBe(400)
  })

  it('a valid value is unaffected', async () => {
    await expect(
      payload.find({
        collection: 'meditations',
        where: { type: { equals: 'lesson' } },
      }),
    ).resolves.toBeTruthy()
  })
})
