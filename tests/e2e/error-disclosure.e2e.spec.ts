import { expect, test } from '@playwright/test'

import { authHeaders, ensureAdmin } from './_helpers/preview'

/**
 * What the DEPLOYED config discloses — sydevs/SahajCloud#684.
 *
 * **This is the only gate that goes red if `payload.config.ts` is reverted to
 * `debug: true`.** The integration pair (`tests/int/error-disclosure*.int.spec.ts`)
 * pins the *pipeline* — what each value of the flag discloses, and that
 * `databaseErrorPlugin`'s 400 survives either — but both suites pass their own
 * `debug` to `createTestEnvironment`, so neither can observe the app's own
 * setting. This lane can: the Railway PR preview runs `NODE_ENV=production`
 * against the real `payload.config.ts`, so these two requests read the shipped
 * value rather than a fixture's copy of it.
 *
 * ⚠ **Preview-only, and not for the usual reason.** The other smoke specs skip
 * when the preview DB has no seeded content; these skip when there is no
 * `PREVIEW_URL` at all, because the local fallback (`http://localhost:3000`) is
 * a development server where `debug` is on *by design* — a redaction assertion
 * there would be correct and inapplicable at the same time. On the preview both
 * cases are unconditional: a skip would make the check vacuous, which is the one
 * failure mode this file exists to remove.
 */

/**
 * A request that reaches Postgres and fails with something OTHER than a 22P02,
 * so `databaseErrorPlugin` does not rescue it and `config.debug` is the only
 * thing acting on the body. `limit` is bound into the query as a bigint and this
 * value overflows it.
 */
const FIVE_HUNDRED_PATH = '/api/meditations?limit=99999999999999999999'

/**
 * The live 22P02. `meditations.type` stores `lesson` and is labelled "Path", so
 * a caller reading the admin UI sends `path` — the exact production query behind
 * Sentry 126185460.
 */
const CAST_FAILURE_PATH = '/api/meditations?where[type][equals]=path'

const NO_PREVIEW =
  'no PREVIEW_URL — the localhost fallback is a development server, where `debug` is on by design'

test('the deployed config redacts a 500 to `Something went wrong.`', async ({ request }) => {
  test.skip(!process.env.PREVIEW_URL, NO_PREVIEW)

  // Authenticated deliberately: access control refuses an anonymous read with
  // 403 *before* any query runs, so an unauthenticated request never reaches
  // Postgres and cannot produce the error under test.
  const token = await ensureAdmin(request)
  const res = await request.get(FIVE_HUNDRED_PATH, { headers: authHeaders(token) })

  expect(res.status()).toBe(500)
  expect(await res.json()).toEqual({ errors: [{ message: 'Something went wrong.' }] })

  // Asserted against the whole serialized body rather than one key: the point is
  // that none of it reaches the caller by any route.
  const raw = await res.text()
  expect(raw).not.toContain('Failed query')
  expect(raw).not.toContain('params:')
  expect(raw).not.toContain('select ')
  expect(raw).not.toContain('at Object')
})

test("the deployed config keeps databaseErrorPlugin's 400 for a cast failure", async ({
  request,
}) => {
  test.skip(!process.env.PREVIEW_URL, NO_PREVIEW)

  // The redaction runs BEFORE root `afterError` hooks, so the plugin's body
  // replacement survives it. That ordering is upstream's, and this is where it
  // is observed against the real deployment rather than a test config.
  const token = await ensureAdmin(request)
  const res = await request.get(CAST_FAILURE_PATH, { headers: authHeaders(token) })

  expect(res.status()).toBe(400)

  const body = (await res.json()) as { errors: Array<{ code?: string; message: string }> }
  expect(body.errors[0]?.code).toBe('22P02')
  expect(body.errors[0]?.message).toContain('invalid input value for enum')

  // The 400 returns the DRIVER's message, not drizzle's wrapper — which is the
  // string that would carry the statement and its bound values.
  const raw = await res.text()
  expect(raw).not.toContain('Failed query')
  expect(raw).not.toContain('params:')
})
