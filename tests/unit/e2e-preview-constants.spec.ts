import { describe, expect, it } from 'vitest'

import { PREVIEW_ADMIN_ADDRESS } from '@/lib/preview/proxy'
import { REQUEST_MAGIC_LINK_PATH } from '@/plugins/login/endpoints/requestMagicLink'

import { PREVIEW_ADMIN, REQUEST_PATH } from '../e2e/_helpers/preview'

/**
 * The one value the smoke lane still spells by hand.
 *
 * ⚠ **The smoke specs import nothing from `src/`** — they run over HTTP against
 * a deployed preview, so a shared import would pull the app's module graph into
 * the Playwright process. `@/lib/preview/proxy` is the exception, because it has
 * zero imports of its own, so the admin's address is imported rather than
 * copied. `REQUEST_MAGIC_LINK_PATH` is not: its module pulls Payload. That copy
 * is free to drift, and a drifted route fails as a 404 the helper reports as
 * "refused the request", which reads like a broken gate.
 */
describe('the smoke lane copies', () => {
  it('reads the address the deploy provisions, rather than restating it', () => {
    expect(PREVIEW_ADMIN.email).toBe(PREVIEW_ADMIN_ADDRESS)
  })

  it('names the route the login plugin registers', () => {
    // ⚠ Against the helper's own constant, not a literal. Comparing the
    // plugin's path to a hardcoded string passed while the helper drifted —
    // the one thing this spec exists to catch.
    expect(REQUEST_PATH).toBe(`/api/managers${REQUEST_MAGIC_LINK_PATH}`)
  })
})
