/**
 * Where every confirmation form posts (#839).
 *
 * One route spends every kind of link, so there is no longer a wrong route to
 * post an invitation to. What is left to pin is the address itself, and that
 * the token cannot re-address it.
 */
import { describe, expect, it } from 'vitest'

import { redeemUrl } from '@/app/(frontend)/_components/loginUrls'
import { managersLogin } from '@/collections/Managers/login'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { REDEEM_PATH } from '@/plugins/login'

const TOKEN = 'a token/with?reserved=characters'
const base = `${getServerUrl()}/api/${managersLogin.slug}`

describe('the sign-in page’s redeem URL', () => {
  it('addresses the one redeem route', () => {
    expect(redeemUrl('T')).toBe(`${base}${REDEEM_PATH}?token=T`)
  })

  it('escapes the token it carries', () => {
    // A JWT needs no escaping, but the value reaches a query string and a `/`
    // or `?` in it would silently re-address the form.
    expect(redeemUrl(TOKEN)).toBe(`${base}${REDEEM_PATH}?token=${encodeURIComponent(TOKEN)}`)
    expect(redeemUrl(TOKEN)).not.toContain('?reserved=')
  })
})
