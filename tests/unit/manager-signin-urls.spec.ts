/**
 * Where each confirmation form posts (#839).
 *
 * ⚠ **The gap this closes.** The sign-in page is an async server component that
 * reaches for `getPayload`, so no spec renders it — and the two redeem routes
 * differ by one word. An invitation posted to the sign-in route is refused for
 * a wrong audience, which reaches the holder as "this link is not valid" with
 * nothing failing anywhere: both lanes stay green while every invitation click
 * dies. `urls.ts` exists to be pinned here.
 */
import { describe, expect, it } from 'vitest'

import { acceptUrl, redeemUrl } from '@/app/(frontend)/managers/signin/urls'
import { managersLogin } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { REDEEM_INVITE_PATH, REDEEM_MAGIC_LINK_PATH } from '@/plugins/login'

const TOKEN = 'a token/with?reserved=characters'
const base = `${getServerUrl()}/api/${managersLogin.slug}`

describe('the sign-in page’s redeem URLs', () => {
  it('sends an invitation to the invitation route, and a link to the sign-in route', () => {
    expect(acceptUrl('T')).toBe(`${base}${REDEEM_INVITE_PATH}?token=T`)
    expect(redeemUrl('T')).toBe(`${base}${REDEEM_MAGIC_LINK_PATH}?token=T`)
  })

  it('addresses two different routes', () => {
    // The whole failure mode is one of these quietly becoming the other.
    expect(REDEEM_INVITE_PATH).not.toBe(REDEEM_MAGIC_LINK_PATH)
    expect(acceptUrl('T')).not.toBe(redeemUrl('T'))
  })

  it('escapes the token it carries', () => {
    // A JWT needs no escaping, but the value reaches a query string and a `/`
    // or `?` in it would silently re-address the form.
    expect(acceptUrl(TOKEN)).toBe(`${base}${REDEEM_INVITE_PATH}?token=${encodeURIComponent(TOKEN)}`)
    expect(acceptUrl(TOKEN)).not.toContain('?reserved=')
  })
})
