/**
 * Integration tests for the user-message intake (#632) — the built-in create on
 * `user-messages` as an API client actually performs it: write-guard plugin →
 * field-level access → `prepareUserMessage`.
 *
 * These run with **`overrideAccess: false`** and a real published client, which
 * is the whole point: `overrideAccess: true` skips field-level access, so a spec
 * using it could not tell a stripped system field from an accepted one. The
 * neighbouring `event-submissions` spec uses the override because it is testing
 * hooks rather than access.
 *
 * The one external dependency is stubbed: the Turnstile siteverify call.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Client, Manager, UserMessage } from '@/payload-types'
import { bypassPermissions, hasPermission } from '@/plugins/access'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

const VALID_TURNSTILE = { 'x-turnstile-token': 'tok-valid' }
const MESSAGE = 'The venue for this class closed last month.'

describe('User messages intake (POST /api/user-messages)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client

  /** A `req` carrying the real published client doc, so access control runs for real. */
  const clientReq = (headers: Record<string, string> = VALID_TURNSTILE) =>
    ({
      payload,
      headers: new Headers(headers),
      user: { ...client, collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  /** Create a message the way the widget does — access control included. */
  const send = (
    data: Record<string, unknown> = {},
    headers: Record<string, string> = VALID_TURNSTILE,
  ) =>
    payload.create({
      collection: 'user-messages',
      data: { message: MESSAGE, ...data } as never,
      overrideAccess: false,
      req: clientReq(headers),
    }) as Promise<UserMessage>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    manager = await testData.createManager(payload, {
      name: 'Message Admin',
      email: 'message-admin@example.com',
    })
    client = await testData.createClient(payload, manager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    verifyMock.mockReset().mockResolvedValue({ success: true })
  })

  describe('write guard', () => {
    // The codes travel as `APIError.data.code`, which Payload's `formatErrors`
    // renders on the wire as `errors[].data.code` — the position the Atlas
    // widget reads. That move (from `errors[].code`) is the breaking change
    // #632 made by retiring the hand-rolled endpoint.
    it('refuses a failed captcha with 403 captcha_failed', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'rejected', errorCodes: [] })
      await expect(send()).rejects.toMatchObject({
        status: 403,
        data: { code: 'captcha_failed' },
      })
    })

    it('refuses a URL in the message with 400 urls_not_allowed', async () => {
      await expect(
        send({ message: 'Great class, see https://spam.example for details' }),
      ).rejects.toMatchObject({ status: 400, data: { code: 'urls_not_allowed' } })
    })

    it('refuses a URL in the subject too', async () => {
      // `subject` is caller-supplied free text like `message`, so it is scanned.
      await expect(send({ subject: 'Visit www.spam-site.org' })).rejects.toMatchObject({
        status: 400,
        data: { code: 'urls_not_allowed' },
      })
    })

    it('refuses a disposable sender address with 400 disposable_email', async () => {
      await expect(send({ senderEmail: 'throwaway@mailinator.com' })).rejects.toMatchObject({
        status: 400,
        data: { code: 'disposable_email' },
      })
    })

    it('lets a clean message through', async () => {
      const created = await send({ senderEmail: 'seeker@example.com' })
      expect(created.message).toBe(MESSAGE)
      expect(created.status).toBe('screening')
    })
  })

  describe('system fields are not client-writable', () => {
    // `status` and `client` are defended twice — field access strips them AND
    // `prepareUserMessage` overwrites them — so they cannot isolate the access
    // guard. `screeningResult` and `deliveredAt` are touched by no create hook,
    // which makes them the fields that actually prove field access is doing the
    // work.
    it('strips a forged screeningResult', async () => {
      const created = await send({
        screeningResult: { verdict: 'ok', screenedAt: '2020-01-01T00:00:00.000Z' },
      })
      expect(created.screeningResult).toBeFalsy()
    })

    it('strips a forged deliveredAt', async () => {
      const created = await send({ deliveredAt: '2020-01-01T00:00:00.000Z' })
      expect(created.deliveredAt).toBeFalsy()
    })

    it('refuses a forged status — a message cannot arrive pre-delivered', async () => {
      const created = await send({ status: 'delivered' })
      expect(created.status).toBe('screening')
    })

    it('stamps client from the authenticated key, ignoring the body', async () => {
      const created = await send({ client: 999999 })
      const clientId = typeof created.client === 'object' ? created.client?.id : created.client
      expect(clientId).toBe(client.id)
    })
  })

  describe('what prepareUserMessage derives', () => {
    it('links a users row for a sender who left an address', async () => {
      const created = await send({ senderEmail: 'Linked.Person@example.com' })
      const userId = typeof created.user === 'object' ? created.user?.id : created.user
      expect(userId).toBeTruthy()

      const user = await payload.findByID({
        collection: 'users',
        id: userId as number,
        overrideAccess: true,
      })
      // Normalized by `upsertUserByEmail`, and named from the local part with
      // dots turned into spaces — which is also what keeps the write-guard's
      // URL scan off a `foo.com@…` address.
      expect(user.email).toBe('linked.person@example.com')
      expect(user.name).toBe('Linked Person')
    })

    it('reuses the same users row for a second message from one sender', async () => {
      const first = await send({ senderEmail: 'repeat@example.com' })
      const second = await send({ senderEmail: 'repeat@example.com', message: `${MESSAGE} Again.` })
      const idOf = (m: UserMessage) => (typeof m.user === 'object' ? m.user?.id : m.user)
      expect(idOf(first)).toBe(idOf(second))
    })

    it('leaves an anonymous message unlinked rather than inventing a person', async () => {
      const created = await send({ message: 'No address on this one, just a note.' })
      expect(created.user).toBeFalsy()
    })

    it('stamps a body hash that ignores casing and whitespace', async () => {
      const a = await send({ message: 'Duplicate detection sample text.' })
      const b = await send({ message: '  DUPLICATE   detection sample text.  ' })
      expect(a.bodyHash).toBeTruthy()
      expect(b.bodyHash).toBe(a.bodyHash)
    })
  })

  describe('field bounds', () => {
    it('refuses a message under the 10-character floor', async () => {
      await expect(send({ message: 'too short' })).rejects.toThrow()
    })

    it('refuses a message over the 5000-character ceiling', async () => {
      // The ceiling proves the custom `validate` COMPOSED Payload's built-in
      // rather than replacing it. Supplying `validate` replaces the default
      // that enforces `maxLength`, so without the composition this passes and
      // the collection silently accepts unbounded text
      // (`src/collections/AGENTS.md`).
      await expect(send({ message: 'x'.repeat(5001) })).rejects.toThrow()
    })

    it('refuses an oversized context blob', async () => {
      await expect(send({ context: { error: 'x'.repeat(5000) } })).rejects.toThrow()
    })

    it('refuses a context that is not an object', async () => {
      await expect(send({ context: ['not', 'an', 'object'] })).rejects.toThrow()
    })

    it('defaults the subject when the caller sends none', async () => {
      const created = await send()
      expect(created.subject).toBe('Message')
    })
  })

  describe('access boundary', () => {
    const clientUser = { id: 1, collection: 'clients', roles: ['sahaj-atlas-client'] } as never
    const atlasManager = {
      id: 2,
      collection: 'managers',
      type: 'manager',
      roles: { en: ['atlas-manager'] },
    } as never
    const admin = { id: 3, collection: 'managers', type: 'admin' } as never

    it('lets the atlas client create but never read back', () => {
      expect(
        hasPermission({ user: clientUser, collection: 'user-messages', operation: 'create' }),
      ).toBe(true)
      expect(
        hasPermission({ user: clientUser, collection: 'user-messages', operation: 'read' }),
      ).toBe(false)
    })

    it('denies every manager role — unlike event-submissions, which atlas managers review', () => {
      // The distinction is the point of the collection being in
      // RESTRICTED_COLLECTIONS *and* in no role: these are unscreened messages
      // from strangers about anything at all, so reading one is an
      // admin-bypass-only act.
      //
      // `locale` is required — manager roles are per-locale, so omitting it
      // finds no roles at all and every assertion below passes vacuously.
      for (const operation of ['read', 'update', 'delete'] as const) {
        expect(
          hasPermission({
            user: atlasManager,
            collection: 'user-messages',
            operation,
            locale: 'en',
          }),
          `atlas-manager should not ${operation}`,
        ).toBe(false)
      }
      // Contrast, so the block cannot pass merely because the fixture is inert.
      expect(
        hasPermission({
          user: atlasManager,
          collection: 'event-submissions',
          operation: 'read',
          locale: 'en',
        }),
      ).toBe(true)
    })

    it('lets an admin read them', () => {
      // The admin bypass lives in `bypassPermissions`, which `hasPermission`
      // consults only when handed one — the call shape the RBAC spec uses for
      // every admin assertion.
      expect(
        hasPermission(
          { user: admin, collection: 'user-messages', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)
    })
  })
})
