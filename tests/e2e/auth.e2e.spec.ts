import { expect, test } from '@playwright/test'

import { PREVIEW_ADMIN, authHeaders, ensureAdmin } from './_helpers/preview'

test('admin can log in via REST and fetch /me', async ({ request }) => {
  const token = await ensureAdmin(request)
  expect(token).toBeTruthy()

  const meRes = await request.get('/api/managers/me', { headers: authHeaders(token) })
  expect(meRes.ok()).toBe(true)

  const me = (await meRes.json()) as { user?: { email?: string } }
  expect(me.user?.email).toBe(PREVIEW_ADMIN.email)
})
