/**
 * The two magic-link token kinds (#837).
 *
 * The property under test is the **audience separation**: a token minted for
 * one link type must not verify as the other. `verifyToken` checks the audience
 * natively, before any claim is read, so the whole guard is one string per kind
 * — which is exactly the kind of guard that breaks silently when someone
 * copy-pastes a kind. These specs read the `aud` claim back off the wire rather
 * than importing the constants, so a changed string is visible here.
 */
import { decodeJwt } from 'jose'
import { describe, expect, it } from 'vitest'

import { signVerifyToken } from '@/lib/eventVerification/token'
import {
  INVITE_TOKEN_TTL_MS,
  readInviteToken,
  readSigninToken,
  signInviteToken,
  signSigninToken,
  SIGNIN_TOKEN_TTL_MS,
} from '@/plugins/login'

const SECRET = 'test-secret-for-login-tokens'
const NOW = new Date('2026-09-23T12:00:00.000Z')

const claims = { collection: 'managers', issuedAt: NOW.getTime(), userId: 42 }

describe('login token kinds', () => {
  it('mints each link type under its own audience, and none collides', async () => {
    const signin = decodeJwt(await signSigninToken(claims, SECRET, NOW))
    const invite = decodeJwt(await signInviteToken(claims, SECRET, NOW))
    // The other three kinds already in use. `event-verify` is minted here; the
    // two `submission-*` kinds are asserted as strings because signing one
    // needs nothing this spec has.
    const eventVerify = decodeJwt(await signVerifyToken({ eventId: 1, managerId: 2 }, SECRET, NOW))

    expect(signin.aud).toBe('manager-signin')
    expect(invite.aud).toBe('manager-invite')

    const kinds = [
      signin.aud,
      invite.aud,
      eventVerify.aud,
      'submission-feedback',
      'submission-unsubscribe',
    ]
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('refuses an invitation at the sign-in route, and a sign-in link at the invitation route', async () => {
    const signin = await signSigninToken(claims, SECRET, NOW)
    const invite = await signInviteToken(claims, SECRET, NOW)

    // Both are authentic and unexpired — only the audience differs, and the
    // answer is `invalid` rather than `expired`, which is what stops a caller
    // learning that an aged invitation exists.
    await expect(readSigninToken(invite, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
    await expect(readInviteToken(signin, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })

    await expect(readSigninToken(signin, SECRET, NOW)).resolves.toEqual({
      status: 'valid',
      claims,
    })
  })

  it('gives each kind its own lifetime, and reports an aged token as expired', async () => {
    const signin = await signSigninToken(claims, SECRET, NOW)
    const invite = await signInviteToken(claims, SECRET, NOW)

    const justInsideSignin = new Date(NOW.getTime() + SIGNIN_TOKEN_TTL_MS - 1000)
    const pastSignin = new Date(NOW.getTime() + SIGNIN_TOKEN_TTL_MS + 1000)

    expect((await readSigninToken(signin, SECRET, justInsideSignin)).status).toBe('valid')
    expect((await readSigninToken(signin, SECRET, pastSignin)).status).toBe('expired')

    // The invitation is still good long after the sign-in link has lapsed.
    expect((await readInviteToken(invite, SECRET, pastSignin)).status).toBe('valid')
    expect(
      (await readInviteToken(invite, SECRET, new Date(NOW.getTime() + INVITE_TOKEN_TTL_MS + 1000)))
        .status,
    ).toBe('expired')
  })

  it('refuses a tampered token, and one signed with another secret', async () => {
    const signin = await signSigninToken(claims, SECRET, NOW)
    const [header, body, signature] = signin.split('.')

    // Re-encode the claims with a different `userId`, keeping the signature.
    const forgedBody = Buffer.from(
      JSON.stringify({ ...(decodeJwt(signin) as object), userId: 999 }),
    ).toString('base64url')

    await expect(
      readSigninToken(`${header}.${forgedBody}.${signature}`, SECRET, NOW),
    ).resolves.toEqual({ status: 'invalid' })
    await expect(readSigninToken(`${header}.${body}.${signature}`, 'other-secret', NOW)).resolves
      .toEqual({ status: 'invalid' })
    await expect(readSigninToken(null, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
  })

  it('refuses a token carrying an older claim shape', async () => {
    // `issuedAt` as an ISO string is the shape this design deliberately avoids
    // — comparing renderings would make single-use turn on formatting. An
    // authentically signed token carrying one is malformed, not expired.
    const stale = await signSigninToken(
      { ...claims, issuedAt: NOW.toISOString() as unknown as number },
      SECRET,
      NOW,
    )
    await expect(readSigninToken(stale, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
  })
})
