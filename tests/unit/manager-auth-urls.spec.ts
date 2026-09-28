/**
 * Unit tests for the token URLs the Managers auth config BUILDS.
 *
 * Distinct from `email-templates.spec.ts`, which hands a URL to a template and
 * asserts it round-trips — that proves the template interpolates, and says
 * nothing about whether the URL is one Payload will route. #320 was exactly
 * that gap: `/admin/verify/:token` matches no view, and because
 * `isPublicAdminRoute` waves any route containing `/verify/` past the auth
 * gate, a logged-out recipient is redirected to the login form rather than
 * shown a 404. Nothing failed. The manager simply could never verify.
 *
 * The expectations are built with Payload's own `formatAdminURL` rather than a
 * hand-copied string, so they cannot drift from the router in the same
 * direction the bug did.
 *
 * ⚠ **Only `forgotPassword` builds an admin-route URL now.** `auth.verify` was
 * repointed at the invitation (#839), which addresses the sign-in page instead
 * — `manager-invite.spec.ts` owns that shape, and asserts this file's old
 * `/admin/managers/verify/:token` no longer appears.
 */
import type { CollectionConfig, IncomingAuthType } from 'payload'

import { formatAdminURL } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { Managers } from '@/collections'
import { getServerUrl } from '@/lib/utilities/serverUrl'

const TOKEN = 'TKN-123'

/** `config.routes.admin` is not overridden in `src/payload.config.ts`, so Payload's default applies. */
const ADMIN_ROUTE = '/admin'

/** Narrow `CollectionConfig['auth']`, which is `boolean | IncomingAuthType | undefined`. */
function authConfig(collection: CollectionConfig): IncomingAuthType {
  const { auth } = collection
  if (!auth || typeof auth === 'boolean') {
    throw new Error(`${collection.slug} has no auth config`)
  }
  return auth
}

describe('Managers auth token URLs', () => {
  it('builds a reset URL that matches Payload’s /reset/:token route', async () => {
    const generate = authConfig(Managers).forgotPassword
    if (!generate?.generateEmailHTML) {
      throw new Error('Managers.auth.forgotPassword.generateEmailHTML is not configured')
    }

    const html = await generate.generateEmailHTML({ token: TOKEN, user: { name: 'Sam' } } as never)

    // The sibling that was already correct — `reset` is matched by name at the
    // two-segment branch, so it carries NO collection slug. Pinned so that
    // "make the two consistent" cannot regress it into the verify shape.
    const expected =
      getServerUrl() + formatAdminURL({ adminRoute: ADMIN_ROUTE, path: `/reset/${TOKEN}` })

    expect(html).toContain(expected)
    expect(html).not.toContain(`${ADMIN_ROUTE}/${Managers.slug}/reset/${TOKEN}`)
  })
})
