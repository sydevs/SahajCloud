import { describe, expect, it } from 'vitest'

import { MANAGER_SIGNIN_PATH } from '@/collections/Managers/login'

import nextConfig from '../../next.config.mjs'

/**
 * `/managers/signin` must keep forwarding to the sign-in view (#840).
 *
 * The old path shipped in #849, so invitations (7 days) and reminders' page
 * links (10 days) already mailed address it. Without the forward each one 404s,
 * and the manager it was sent to has no other way in — the link carries the
 * only credential they hold.
 *
 * ⚠ This spec exists because prose did not hold. The redirect was deleted once
 * on the premise that the old path never shipped, with four comments saying
 * otherwise, and nothing failed.
 */
describe('the /managers/signin forward', () => {
  it('redirects permanently to the sign-in view, which is the admin login', async () => {
    const redirects = await nextConfig.redirects!()

    expect(redirects).toContainEqual({
      source: '/managers/signin',
      destination: MANAGER_SIGNIN_PATH,
      permanent: true,
    })
    expect(MANAGER_SIGNIN_PATH).toBe('/admin/login')
  })
})
