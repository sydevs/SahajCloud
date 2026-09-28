import { expect, test } from '@playwright/test'

import { PREVIEW_ADMIN, authHeaders, ensureAdmin } from './_helpers/preview'

test('admin can exchange the preview secret and fetch /me', async ({ request }) => {
  const token = await ensureAdmin(request)
  expect(token).toBeTruthy()

  const meRes = await request.get('/api/managers/me', { headers: authHeaders(token) })
  expect(meRes.ok()).toBe(true)

  const me = (await meRes.json()) as { user?: { email?: string } }
  expect(me.user?.email).toBe(PREVIEW_ADMIN.email)
})

/**
 * The deployed half of "no manager can authenticate with a password" (#840).
 *
 * The integration lane proves the route is `Forbidden` against the config; this
 * proves the deployed preview serves that config, on the exact credential the
 * exchange above accepts — so a green run cannot mean the switch was dropped.
 */
test('password login is refused, on the very secret the exchange accepts', async ({ request }) => {
  const res = await request.post('/api/managers/login', { data: PREVIEW_ADMIN })

  expect(res.status()).toBe(403)
})
