/**
 * The session cookie, as a Server Action has to set it (#840).
 *
 * The redeem routes send a `Set-Cookie` header. The manager sign-in page's Server
 * Action cannot — it signs the preview admin in and then redirects — so it sets
 * the same cookie through `cookies().set`, which takes a name, a value and Next's
 * own options object.
 *
 * ⚠ **What this pins is that the two are the SAME cookie.** A second derivation
 * of the name, the expiry or `secure` would drift from `generatePayloadCookie`'s,
 * and a session cookie wrong by one attribute fails only in a browser — nothing
 * in either lane would see it. So every assertion below reads the parts back
 * against the header string rather than against a literal.
 */
import { describe, expect, it } from 'vitest'

import { sessionCookie, sessionCookieParts } from '@/plugins/login'

const TOKEN = 'a.jwt.value'

/** Enough of a Payload to answer `generatePayloadCookie`. */
const payload = {
  collections: {
    managers: {
      config: {
        auth: {
          cookies: { domain: undefined, sameSite: 'Lax', secure: false },
          tokenExpiration: 7200,
        },
      },
    },
  },
  config: { cookiePrefix: 'sahaj' },
} as never

const parts = () => sessionCookieParts(payload, 'managers', TOKEN)
const header = () => sessionCookie(payload, 'managers', TOKEN)

describe('sessionCookieParts', () => {
  it('carries the name and the token the header does', () => {
    const { name, value } = parts()

    expect(header().startsWith(`${name}=${value};`)).toBe(true)
    expect(value).toBe(TOKEN)
  })

  it('translates every attribute the header carries, and invents none', () => {
    const attributes = header()
      .split('; ')
      .slice(1)
      .map((attribute) => attribute.split('=')[0]!.toLowerCase())

    // Lower-cased and de-hyphenated, Next's option names are Payload's attribute
    // names — so an attribute Payload starts sending and this drops shows up here
    // as a missing key rather than as a cookie a browser quietly rejects.
    const options = Object.keys(parts().options).map((key) => key.toLowerCase())

    expect(options.sort()).toEqual(attributes.map((a) => a.replace('-', '')).sort())
  })

  it('hands Next a boolean, not the string Payload writes', () => {
    // ⚠ The sharp one: Payload spells these `HttpOnly=true` / `Secure=true`, and
    // every non-empty string is truthy — so a parser that copied the value would
    // read `Secure=false`, if Payload ever sent it, as secure.
    const secure = {
      ...(payload as unknown as Record<string, unknown>),
      collections: {
        managers: {
          config: {
            auth: {
              cookies: { domain: undefined, sameSite: 'Lax', secure: true },
              tokenExpiration: 7200,
            },
          },
        },
      },
    } as never

    expect(sessionCookieParts(secure, 'managers', TOKEN).options.secure).toBe(true)
  })

  it('reads a valueless attribute as true and the expiry as a Date', () => {
    const { options } = parts()

    expect(options.httpOnly).toBe(true)
    // Payload omits `Secure` rather than spelling it false, and an absent option
    // is what Next reads as not secure.
    expect(options.secure).toBeUndefined()
    expect(options.path).toBe('/')
    expect(options.expires).toBeInstanceOf(Date)
  })
})
