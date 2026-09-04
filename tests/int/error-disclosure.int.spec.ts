import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  CAST_FAILURE_PATH,
  createRestClient,
  FIVE_HUNDRED_PATH,
  type RestClient,
} from '../utils/restRequest'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * What a production error body discloses over REST — sydevs/SahajCloud#684.
 *
 * `debug: true` was unconditional in `payload.config.ts`, and Payload gates its
 * production redaction on exactly that flag: `isErrorPublic` returns true the
 * moment it is set, so `routeError` never swaps a non-public error's body for
 * `Something went wrong.` and additionally attaches `response.stack`. Production
 * therefore answered any unhandled error with its real message — for a database
 * error, drizzle's `Failed query: <full SQL>\nparams: <bound values>` — plus a
 * stack trace, to anyone who could reach the endpoint.
 *
 * **This suite pins production's behaviour; `error-disclosure-debug.int.spec.ts`
 * pins development's.** They are two files rather than two `describe`s because
 * `getPayload` caches per config and a second `createTestEnvironment()` in one
 * file silently returns the FIRST instance — so a same-file pair would have
 * asserted one `debug` value twice while claiming to compare two. (Observed: the
 * second call fails creating its admin, `The following field is invalid: email`,
 * because it lands in the first suite's schema.)
 *
 * ⚠ **What this pair does NOT cover: the config line itself.** Both suites pass
 * their own `debug` to `createTestEnvironment`, so both stay green with
 * `payload.config.ts` reverted to `debug: true`. What they pin is the pipeline —
 * what each VALUE discloses, and that the plugin's 400 survives either — which is
 * the half that is upstream's behaviour rather than ours and can therefore change
 * under us. The flag itself is a one-token expression, checked in review and on
 * the preview (#684's verification checklist). Asserting it here was tried and
 * rejected: reading `debug` off the app's real config means importing
 * `@/payload.config`, which pulls in the JSX email templates and dies under a
 * production transform with `jsxDEV is not a function` — a fragile guard around a
 * constant.
 *
 * **Fixture assumption, stated before it was written:** the test config carries
 * `databaseErrorPlugin()` and takes `debug` from its caller, matching
 * `payload.config.ts`. Verified by adding both to `createBaseTestConfig` in
 * `tests/utils/testHelpers.ts` in this same commit — before it, the plugin was
 * absent from the test config entirely, so this suite would have been asserting
 * a pipeline the app does not run.
 */
describe('error disclosure over REST — debug OFF, as production now is', () => {
  let payload: Payload
  let request: RestClient
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment({ debug: false })
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    request = await createRestClient(testEnv)
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('a 500 is redacted', () => {
    it('answers `Something went wrong.` with no stack', async () => {
      const { status, body } = await request(FIVE_HUNDRED_PATH)

      expect(status).toBe(500)
      expect(body).toEqual({ errors: [{ message: 'Something went wrong.' }] })
      expect(body).not.toHaveProperty('stack')
    })

    it('leaks no SQL, no bound parameters and no stack frames', async () => {
      // The disclosure this ticket exists to close. Asserted against the whole
      // serialized body rather than one key, since the point is that none of it
      // reaches the caller by any route.
      const { raw } = await request(FIVE_HUNDRED_PATH)

      expect(raw).not.toContain('Failed query')
      expect(raw).not.toContain('params:')
      expect(raw).not.toContain('select ')
      expect(raw).not.toContain('meditations')
      expect(raw).not.toContain('at Object')
    })
  })

  describe('a 22P02 keeps its 400 — the ordering in routeError is what makes that true', () => {
    // #684's last acceptance criterion. `databaseErrorPlugin`'s `afterError`
    // hook runs AFTER the redaction and replaces the body wholesale, so its 400
    // survives `debug: false`. That ordering is upstream's and nothing of ours
    // states it: a Payload release that moved root hooks above the swap would
    // turn every cast failure into an opaque 500 with nothing going red.
    it('answers 400 with the Postgres message and the SQLSTATE', async () => {
      const { status, body } = await request(CAST_FAILURE_PATH)

      expect(status).toBe(400)
      expect(body).toEqual({
        errors: [
          {
            code: '22P02',
            message: expect.stringContaining('invalid input value for enum'),
          },
        ],
      })
    })

    it('names the offending value, which is the whole usefulness of the 400', async () => {
      // Read off the parsed body, not the raw JSON: the value arrives quoted by
      // Postgres, so in `raw` it is `\"path\"` and a `toContain('"path"')` fails
      // for a reason that has nothing to do with the property under test.
      const { body } = await request(CAST_FAILURE_PATH)
      const message = (body.errors as Array<{ message: string }>)[0].message

      expect(message).toContain('enum_meditations_type')
      expect(message).toContain('"path"')
    })

    it('still discloses no SQL and no bound parameters', async () => {
      // The plugin returns the DRIVER's primary message, reached by walking
      // `cause` down to `pg`'s `DatabaseError` — not drizzle's wrapper, which is
      // the string carrying the query. The two are easy to conflate; this is the
      // assertion that keeps them apart.
      const { raw } = await request(CAST_FAILURE_PATH)

      expect(raw).not.toContain('Failed query')
      expect(raw).not.toContain('params:')
      expect(raw).not.toContain('select count(*)')
    })
  })

  it('the local API still throws the unredacted error to server-side callers', async () => {
    // Redaction is a REST-response concern only. A hook, a job or an endpoint
    // catching its own error must still see the real one, or `mapPostgresCastError`
    // and the Sentry filter would both go blind — and `Events/endpoints/geojson.ts`
    // depends on exactly that.
    await expect(
      payload.find({ collection: 'meditations', where: { type: { equals: 'path' } } }),
    ).rejects.toThrow(/Failed query/)
  })
})
