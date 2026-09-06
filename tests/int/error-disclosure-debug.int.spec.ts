import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  CAST_FAILURE_PATH,
  createRestClient,
  FIVE_HUNDRED_PATH,
  type RestClient,
} from '../utils/restRequest'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The other half of sydevs/SahajCloud#684: what a NON-production build still
 * discloses, and why that is the point rather than a leftover.
 *
 * `error-disclosure.int.spec.ts` pins production (`debug: false`). This file is
 * its control, and the pair is what makes the fix a measured claim instead of a
 * reading of upstream source: the same request, the same plugin, one flag apart.
 * Without it, every assertion in the production suite would pass just as well
 * with `debug` hard-coded false in the app — which is not what shipped, and not
 * what `payload.config.ts` now says.
 *
 * It also covers #684's fourth acceptance criterion directly — *local dev and
 * E2E keep the verbose bodies the original comment asked for*. Nothing else
 * asserts that the flip did not simply blind developers.
 *
 * Two files rather than two `describe`s: `getPayload` caches per config, so a
 * second `createTestEnvironment()` in one file returns the FIRST instance and a
 * same-file pair would assert one `debug` value twice. See the sibling's
 * docblock for what that looks like when you try it.
 */
describe('error disclosure over REST — debug ON, as local development is', () => {
  let request: RestClient
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment({ debug: true })
    cleanup = testEnv.cleanup
    request = await createRestClient(testEnv)
  })

  afterAll(async () => {
    await cleanup()
  })

  it('a 500 keeps the real message AND a stack — the verbose body dev asked for', async () => {
    const { status, body, raw } = await request(FIVE_HUNDRED_PATH)

    expect(status).toBe(500)
    expect(raw).toContain('Failed query')
    expect(body).toHaveProperty('stack')
  })

  it('and that verbose body is exactly what production must not send', async () => {
    // Stated as its own case because it is the finding, not a detail: with the
    // flag on, the body carries the full statement and the bound values. The
    // production suite asserts each of these strings ABSENT against the same
    // request, so the two files together show the flag is the cause.
    const { raw } = await request(FIVE_HUNDRED_PATH)

    expect(raw).toContain('select ')
    expect(raw).toContain('params:')
    expect(raw).toContain('meditations')
  })

  it('a 22P02 answers 400 with the Postgres message here too', async () => {
    // The plugin's 400 is independent of `debug` in BOTH directions, which is
    // what made the flag safe to flip without touching the plugin.
    const { status, body } = await request(CAST_FAILURE_PATH)

    expect(status).toBe(400)
    expect(body).toEqual({
      errors: [
        { code: '22P02', message: expect.stringContaining('invalid input value for enum') },
      ],
    })
  })
})
