import { describe, expect, it } from 'vitest'

import { describeRefusal, parseSignInLink, sessionTokenFrom } from '../../scripts/signin-token'

const jwt = (claims: Record<string, unknown>): string =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`

describe('parseSignInLink', () => {
  it('reads the origin, token, collection and expiry off an emailed link', () => {
    const token = jwt({ aud: 'manager-signin', collection: 'managers', exp: 1_800_000_000 })
    const parsed = parseSignInLink(`  https://cloud.example.com/admin/login?token=${token}\n`)

    expect(parsed).toEqual({
      origin: 'https://cloud.example.com',
      token,
      collection: 'managers',
      expiresAt: new Date(1_800_000_000_000),
    })
  })

  it('refuses a link with no token, a non-URL, and a token that is not a sign-in JWT', () => {
    expect(() => parseSignInLink('https://cloud.example.com/admin/login')).toThrow(/no \?token=/)
    expect(() => parseSignInLink('cloud.example.com/admin/login')).toThrow(/not a URL/)
    expect(() => parseSignInLink('https://x.test/?token=abc')).toThrow(/not a JWT/)
    expect(() => parseSignInLink(`https://x.test/?token=${jwt({ exp: 1 })}`)).toThrow(
      /no collection/,
    )
  })
})

describe('sessionTokenFrom', () => {
  it('finds the session cookie among the others', () => {
    const cookies = [
      'payload-tab=contact; Path=/',
      'payload-token=abc.def.ghi; Path=/; HttpOnly=true; Secure=true; SameSite=Lax',
    ]
    expect(sessionTokenFrom(cookies)).toBe('abc.def.ghi')
  })

  it('reads a cleared cookie, or none at all, as no session', () => {
    expect(sessionTokenFrom(['payload-token=; Max-Age=0'])).toBeNull()
    expect(sessionTokenFrom([])).toBeNull()
  })
})

describe('describeRefusal', () => {
  it('words each refusal the redeem route redirects with', () => {
    const at = (error: string) => `https://cloud.example.com/admin/login?error=${error}`
    expect(describeRefusal(302, at('expired'))).toMatch(/expired/)
    expect(describeRefusal(302, at('invalid'))).toMatch(/already used/)
    expect(describeRefusal(302, at('invite-accepted'))).toMatch(/already accepted/)
    expect(describeRefusal(500, null)).toBe('The server answered 500 and set no session.')
  })
})
