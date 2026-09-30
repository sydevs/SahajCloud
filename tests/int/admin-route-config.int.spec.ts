import { formatAdminURL } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { adminUrl } from '@/lib/utilities/adminUrl'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import configPromise from '@/payload.config'

/**
 * #851 — in-panel hrefs and `adminUrl()`'s `adminRoute` are `/admin` literals,
 * because nothing in this repo reads `routes.admin` and nothing sets it.
 * Setting it now would move the panel and strand every literal, with nothing to
 * say so until someone clicked.
 *
 * One of those literals breaks without any href being wrong, so a grep for
 * hrefs misses it: `isAdminPath` (`plugins/login/token.ts`) refuses a sign-in
 * link's landing path unless it starts `/admin/`.
 *
 * `admin.routes` is a second namespace, defaulted separately, and two
 * `adminUrl()` callers spell one of its segments — the reset mail's
 * `/reset/:token` and the invitation's `/account`. Moving either points the
 * mail at no view at all, which is #320: the recipient lands on the login form
 * and nothing errors.
 *
 * The expectation joins through Payload's own `formatAdminURL`, as
 * `manager-auth-urls.spec.ts` does, so the two sides differ only in where the
 * route came from.
 */
describe('admin routes', () => {
  it('are the defaults every literal assumes', async () => {
    const config = await configPromise
    const path = '/collections/events/1'

    expect(config.routes.admin).toBe('/admin')
    expect(adminUrl(path)).toBe(
      formatAdminURL({ adminRoute: config.routes.admin, path, serverURL: getServerUrl() }),
    )
    expect(config.admin.routes.account).toBe('/account')
    expect(config.admin.routes.reset).toBe('/reset')
  })
})
