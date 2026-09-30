/**
 * The three login link kinds (#837, #839).
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

import {
  INVITE_TOKEN_TTL_MS,
  LINK_TOKEN_TTL_MS,
  readAnyLoginToken,
  readInviteToken,
  readLinkToken,
  readSigninToken,
  signInviteToken,
  signLinkToken,
  signSigninToken,
  SIGNIN_TOKEN_TTL_MS,
} from '@/plugins/login'

const SECRET = 'test-secret-for-login-tokens'
const NOW = new Date('2026-09-23T12:00:00.000Z')

const claims = { collection: 'managers', issuedAt: NOW.getTime(), userId: 42 }

const link = { ...claims, label: 'Tuesday Evening Meditation', to: '/admin/collections/events/7' }

describe('login token kinds', () => {
  it('mints each link type under its own audience, and none collides', async () => {
    const signin = decodeJwt(await signSigninToken(claims, SECRET, NOW))
    const invite = decodeJwt(await signInviteToken(claims, SECRET, NOW))
    const page = decodeJwt(await signLinkToken(link, SECRET, NOW))

    expect(signin.aud).toBe('manager-signin')
    expect(invite.aud).toBe('manager-invite')
    expect(page.aud).toBe('manager-link')

    // The two other kinds in use, asserted as strings because signing one needs
    // nothing this spec has.
    const kinds = [signin.aud, invite.aud, page.aud, 'submission-feedback', 'submission-unsubscribe']
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('refuses an invitation read as a sign-in link, and the reverse', async () => {
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

describe('page links', () => {
  it('round-trips the page it lands on and the label it shows', async () => {
    const token = await signLinkToken(link, SECRET, NOW)

    await expect(readLinkToken(token, SECRET, NOW)).resolves.toEqual({
      status: 'valid',
      claims: link,
    })
  })

  it('is refused by the sign-in and invitation readers, and refuses their tokens', async () => {
    const page = await signLinkToken(link, SECRET, NOW)

    await expect(readSigninToken(page, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
    await expect(readInviteToken(page, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
    await expect(
      readLinkToken(await signInviteToken(claims, SECRET, NOW), SECRET, NOW),
    ).resolves.toEqual({ status: 'invalid' })
  })

  it('carries the event a reminder may verify, and refuses a malformed one', async () => {
    const token = await signLinkToken({ ...link, verifies: 7 }, SECRET, NOW)
    const result = await readLinkToken(token, SECRET, NOW)
    expect(result.status === 'valid' && result.claims.verifies).toBe(7)

    const bad = await signLinkToken({ ...link, verifies: '7' as unknown as number }, SECRET, NOW)
    await expect(readLinkToken(bad, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
  })

  it('carries the tab to open the landing page on', async () => {
    const token = await signLinkToken({ ...link, to: '/admin/account', tab: 'Contact' }, SECRET, NOW)
    const result = await readLinkToken(token, SECRET, NOW)
    expect(result.status === 'valid' && result.claims.tab).toBe('Contact')
  })

  it('refuses any landing page outside the admin, even one it signed', async () => {
    // Signed by us, so only a signing bug could produce one — and then it must
    // not become an open redirect.
    for (const to of ['https://evil.example/admin/', '//evil.example/admin/', '/api/managers']) {
      const token = await signLinkToken({ ...link, to }, SECRET, NOW)
      await expect(readLinkToken(token, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
    }
  })

  it('lasts until the next reminder, then expires', async () => {
    const token = await signLinkToken(link, SECRET, NOW)
    const justBefore = new Date(NOW.getTime() + LINK_TOKEN_TTL_MS - 1000)
    const after = new Date(NOW.getTime() + LINK_TOKEN_TTL_MS + 1000)

    expect((await readLinkToken(token, SECRET, justBefore)).status).toBe('valid')
    expect((await readLinkToken(token, SECRET, after)).status).toBe('expired')
  })
})

describe('readAnyLoginToken', () => {
  it('reads each kind by its own audience, with that kind’s claims', async () => {
    const read = (token: string) => readAnyLoginToken(token, SECRET, NOW)

    await expect(read(await signSigninToken(claims, SECRET, NOW))).resolves.toEqual({
      status: 'valid',
      token: { kind: 'signin', claims },
    })
    await expect(read(await signInviteToken(claims, SECRET, NOW))).resolves.toEqual({
      status: 'valid',
      token: { kind: 'invite', claims },
    })
    await expect(read(await signLinkToken(link, SECRET, NOW))).resolves.toEqual({
      status: 'valid',
      token: { kind: 'link', claims: link },
    })
  })

  it('refuses a token whose audience it does not verify', async () => {
    // The kind is read off the audience *before* verifying, so this is the
    // property that makes that safe: a relabelled audience fails the signature.
    const [header, , signature] = (await signInviteToken(claims, SECRET, NOW)).split('.')
    const relabelled = Buffer.from(
      JSON.stringify({ ...claims, aud: 'manager-signin', exp: NOW.getTime() / 1000 + 60 }),
    ).toString('base64url')

    await expect(readAnyLoginToken(`${header}.${relabelled}.${signature}`, SECRET, NOW)).resolves.toEqual(
      { status: 'invalid' },
    )
  })

  it('refuses a token of no login kind, and anything that is not a token', async () => {
    const [, , signature] = (await signSigninToken(claims, SECRET, NOW)).split('.')
    const other = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ aud: 'submission-feedback' })).toString('base64url')}.${signature}`

    for (const token of [other, 'not-a-token', '', null]) {
      await expect(readAnyLoginToken(token, SECRET, NOW)).resolves.toEqual({ status: 'invalid' })
    }
  })

  it('names the kind of an expired token, so the page can say how long it lasted', async () => {
    const aged = new Date(NOW.getTime() + INVITE_TOKEN_TTL_MS + 1000)

    await expect(
      readAnyLoginToken(await signInviteToken(claims, SECRET, NOW), SECRET, aged),
    ).resolves.toEqual({ status: 'expired', kind: 'invite' })
  })
})
