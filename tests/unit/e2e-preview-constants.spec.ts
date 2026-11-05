import { describe, expect, it } from 'vitest'

import { REQUEST_MAGIC_LINK_PATH } from '@/plugins/login/endpoints/requestMagicLink'
import { PREVIEW_ADMIN_ADDRESS } from '@/plugins/previewAdmin'

import { PREVIEW_ADMIN } from '../e2e/_helpers/preview'

/**
 * The two values the smoke lane spells by hand.
 *
 * ⚠ **The smoke specs import nothing from `src/`** — they run over HTTP against
 * a deployed preview, so a shared import would pull the app's module graph into
 * the Playwright process. The copies are therefore free to drift, and a drifted
 * address fails as "the preview signed nobody in", which reads like a broken
 * deploy. This spec is what makes the drift fail here instead, in a second.
 */
describe('the smoke lane copies', () => {
  it('names the address the deploy provisions', () => {
    expect(PREVIEW_ADMIN.email).toBe(PREVIEW_ADMIN_ADDRESS)
  })

  it('names the route the login plugin registers', () => {
    const helper = String.raw`/api/managers${REQUEST_MAGIC_LINK_PATH}`

    expect(helper).toBe('/api/managers/request-magic-link')
  })
})
