/**
 * The manager invitation, end to end (#839).
 *
 * The sibling of `manager-magic-link.int.spec.ts`, and the same discipline: the
 * link is read out of the captured EMAIL rather than rebuilt from the token this
 * file could sign itself, so a template that embedded no link at all would fail
 * here rather than pass.
 *
 * ⚠ **What is asserted is the SEND, not the template.** `manager-invite.spec.ts`
 * covers the copy and the grant summary without a bootstrap. What only a booted
 * Payload can show is the queue: that a create sends nothing, that an
 * assignment queues and the task sends it once the delay has passed, and that
 * accepting flips `_verified` and mints a session.
 *
 * The one property `manager-verification.int.spec.ts` held alone — an
 * unaccepted manager refused, and admitted after — is asserted below against
 * the real accept route. Managers hold no password since #840, so the refusal
 * it reads is the JWT strategy's `_verified` gate rather than a login error.
 */
import type { Payload } from 'payload'

import { decodeJwt } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { managersLogin, MANAGER_SIGNIN_PATH } from '@/collections/Managers/login'
import { escapeRegExp } from '@/lib/eventQuality/heuristics'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { Manager } from '@/payload-types'
import {
  createSession,
  INVITATION_DELAY_MS,
  INVITE_TOKEN_TTL_MS,
  signInviteToken,
  signLinkToken,
  signSigninToken,
} from '@/plugins/login'
import { sendInvitationsTask } from '@/plugins/login/invitations'

import { EmailTestAdapter } from '../utils/emailTestAdapter'
import {
  createAnonRestClient,
  createRestClientWithAuth,
  type RestClient,
} from '../utils/restRequest'
import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const REDEEM_PATH = '/api/managers/redeem'

const REQUEST_PATH = '/api/managers/request-magic-link'

/**
 * Every link an email carries to the sign-in page. All three kinds arrive as
 * `?token=`, so a test tells them apart the way the page does: by audience.
 */
const PAGE_LINK = new RegExp(
  `${escapeRegExp(`${getServerUrl()}${MANAGER_SIGNIN_PATH}?token=`)}([\\w.%-]+)`,
  'g',
)
const INVITE_URL = 'manager-invite'
const SIGN_IN_URL = 'manager-signin'
const PAGE_LINK_URL = 'manager-link'

describe('manager invitation', () => {
  let payload: Payload
  let env: Awaited<ReturnType<typeof createTestEnvironmentWithEmail>>
  let emailAdapter: EmailTestAdapter
  let anon: RestClient
  let cleanup: () => Promise<void>
  /** The admin whose saves assign things — named in the invitations they cause. */
  let admin: Manager

  /** Accept an invitation the way the confirmation page's form does. */
  const accept = (token: string) =>
    anon(`${REDEEM_PATH}?token=${encodeURIComponent(token)}`, { method: 'POST' })

  const verifiedFlag = async (id: number | string) =>
    (await payload.findByID({ collection: 'managers', id, depth: 0 }))._verified

  /** The first link of this audience in the email, or `null`. */
  const tokenIn = (html: string | undefined, audience: string): null | string =>
    [...(html ?? '').matchAll(PAGE_LINK)]
      .map((match) => decodeURIComponent(match[1]!))
      .find((token) => decodeJwt(token).aud === audience) ?? null

  /**
   * Run the queue's task as though `after` had passed since now — by default,
   * just past the delay, so everything queued so far is due.
   */
  const runQueue = (after = INVITATION_DELAY_MS + 60_000) =>
    runTaskHandler(sendInvitationsTask(managersLogin), {
      payload,
      context: { now: new Date(Date.now() + after) },
    })

  const mailTo = (email: string) =>
    emailAdapter.getCapturedEmails().filter((sent) => JSON.stringify(sent.to).includes(email))

  const queueOf = async (id: number | string) => {
    const manager = await payload.findByID({ collection: 'managers', id, depth: 0 })
    return { due: manager.invitationDueAt, pending: manager.pendingInvitation }
  }

  /**
   * A manager given a role, invited the way a real one is: the create queues
   * the role, and the queue sends the invitation once the delay has passed.
   */
  const invite = async (overrides: Record<string, unknown> = {}) => {
    emailAdapter.clearCapturedEmails()
    const manager = await testData.createManager(payload, {
      type: 'manager',
      roles: { en: ['path-editor'] },
      ...overrides,
    })
    expect(mailTo(manager.email), 'a create sent mail').toHaveLength(0)

    await runQueue()
    const sent = emailAdapter.findEmailByTo(manager.email)
    expect(sent, `no invitation captured for ${manager.email}`).toBeDefined()

    const token = tokenIn(sent!.html, INVITE_URL)
    expect(token, `no invitation link in the body:\n${sent!.html?.slice(0, 400)}`).not.toBeNull()

    return { manager, sent: sent!, token: token! }
  }

  /** A manager with nothing assigned, so nothing is queued for them. */
  const bare = (overrides: Record<string, unknown> = {}) =>
    testData.createManager(payload, { type: 'manager', roles: [], ...overrides })

  const expectAccepted = (answer: { headers: Headers; status: number }) => {
    expect(answer.status).toBe(302)
    expect(answer.headers.get('Location')).toBe(`${getServerUrl()}/admin`)
    expect(answer.headers.get('Set-Cookie')).toBeTruthy()
  }

  const expectRefused = (
    answer: { headers: Headers; status: number },
    reason: 'invalid' | 'invite-accepted' | 'invite-expired',
  ) => {
    expect(answer.status).toBe(302)
    expect(answer.headers.get('Location')).toBe(
      `${getServerUrl()}${MANAGER_SIGNIN_PATH}?error=${reason}`,
    )
    expect(answer.headers.get('Set-Cookie')).toBeNull()
  }

  beforeAll(async () => {
    env = await createTestEnvironmentWithEmail()
    payload = env.payload
    emailAdapter = env.emailAdapter
    cleanup = env.cleanup
    anon = createAnonRestClient(env)
    admin = await testData.createManager(payload, { name: 'Anna Schmidt', type: 'admin' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the invitation queue', () => {
    it('sends nothing on create, and invites once the last assignment has settled', async () => {
      emailAdapter.clearCapturedEmails()
      const manager = await testData.createManager(payload, {
        type: 'manager',
        roles: { en: ['atlas-manager'] },
      })

      // The create queued the role and sent nothing.
      expect(mailTo(manager.email)).toHaveLength(0)
      const { due, pending } = await queueOf(manager.id)
      expect(pending).toMatchObject({ roles: { en: ['atlas-manager'] } })
      expect(due).toBeTruthy()

      // Not yet due: the window is still open for more.
      await runQueue(0)
      expect(mailTo(manager.email)).toHaveLength(0)

      await runQueue()
      const sent = mailTo(manager.email)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.subject).toBe("You've been invited to help as Atlas Manager")
      expect(tokenIn(sent[0]!.html, INVITE_URL)).not.toBeNull()
      expect(await queueOf(manager.id)).toEqual({ due: null, pending: null })
    })

    it('names the region a manager was put on, linked, and who put them there', async () => {
      const manager = await bare()
      emailAdapter.clearCapturedEmails()

      // Saved as the admin, so the invitation can say who asked.
      const region = await testData.createRegion(payload)
      await payload.update({
        collection: 'regions',
        id: region.id,
        data: { managers: [manager.id] },
        user: admin,
      })
      const { webUrl } = await payload.findByID({ collection: 'regions', id: region.id })

      await runQueue()
      const [sent] = mailTo(manager.email)
      expect(sent!.subject).toBe(`You've been invited to look after ${region.name}`)
      expect(sent!.html).toContain(
        'Anna Schmidt has invited you to look after the following on Sahaj Atlas.',
      )
      expect(sent!.html).toContain(`href="${webUrl}"`)
    })

    it('collapses assignments made in quick succession into one invitation', async () => {
      const manager = await bare()
      emailAdapter.clearCapturedEmails()

      const region = await testData.createRegion(payload, { managers: [manager.id] })
      await testData.createEvent(payload, { manager: manager.id, region: region.id })

      await runQueue()
      const sent = mailTo(manager.email)
      expect(sent).toHaveLength(1)
      expect(sent[0]!.subject).toBe("You've been invited to look after 1 region and 1 event")
    })

    it('sends one invitation per project, and a second accepted one says so', async () => {
      const manager = await bare()
      emailAdapter.clearCapturedEmails()

      const region = await testData.createRegion(payload, { managers: [manager.id] })
      const page = await testData.createPage(payload, { managers: [manager.id] })

      await runQueue()
      const sent = mailTo(manager.email)
      expect(sent.map((email) => email.subject).sort()).toEqual(
        [
          `You've been invited to look after ${region.name}`,
          `You've been invited to look after ${page.title}`,
        ].sort(),
      )

      // Each carries its own invitation; the first accepted activates the
      // account, and the second then tells them so rather than "not valid".
      const [first, second] = sent.map((email) => tokenIn(email.html, INVITE_URL)!)
      expectAccepted(await accept(first!))
      const again = await accept(second!)
      expect(again.headers.get('Location')).toBe(
        `${getServerUrl()}${MANAGER_SIGNIN_PATH}?error=invite-accepted`,
      )
      expect(again.headers.get('Set-Cookie')).toBeNull()
    })

    it('queues nothing for a change the manager made themselves', async () => {
      // A region of their own to file it under — a manager may only place an
      // event in their subtree. Its assignment is someone else's, so clear it.
      const manager = await bare()
      const region = await testData.createRegion(payload, { managers: [manager.id] })
      await payload.db.updateOne({
        collection: 'managers',
        id: manager.id,
        data: { pendingInvitation: null, invitationDueAt: null },
        returning: false,
      })

      // Creating an event they manage is not news to them.
      await payload.create({
        collection: 'events',
        data: {
          title: `Own Event ${manager.id}`,
          languages: ['en'],
          manager: manager.id,
          region: region.id,
          verificationStage: 'verified',
          inactive: true,
          contactPhone: '+1-555-0100',
          contactName: 'Test Contact',
        } as never,
        user: manager,
      })

      expect((await queueOf(manager.id)).pending).toBeNull()
    })

    it('does not announce an assignment undone before the send', async () => {
      const manager = await bare()
      emailAdapter.clearCapturedEmails()

      const region = await testData.createRegion(payload, { managers: [manager.id] })
      await payload.update({ collection: 'regions', id: region.id, data: { managers: [] } })

      await runQueue()
      expect(mailTo(manager.email)).toHaveLength(0)
      // Removing a manager queued nothing of its own, and the send cleared the rest.
      expect(await queueOf(manager.id)).toEqual({ due: null, pending: null })
    })

    it('respects a manager who turned invitations off', async () => {
      const manager = await bare({
        notificationPreferences: { invitation: { frequency: 'Never', method: '' } },
      })
      emailAdapter.clearCapturedEmails()

      await testData.createRegion(payload, { managers: [manager.id] })

      await runQueue()
      expect(mailTo(manager.email)).toHaveLength(0)
      expect((await queueOf(manager.id)).pending).toBeNull()
    })

    it('tells an accepted manager what is new, and opens their notification settings', async () => {
      const { manager, token } = await invite()
      expectAccepted(await accept(token))
      emailAdapter.clearCapturedEmails()

      const region = await testData.createRegion(payload, { managers: [manager.id] })

      await runQueue()
      const [sent] = mailTo(manager.email)
      expect(sent!.subject).toBe(`You've been invited to look after ${region.name}`)
      expect(sent!.html).toContain('Configure notifications')
      expect(tokenIn(sent!.html, INVITE_URL)).toBeNull()
      // Only what is new — not the role the first invitation already named.
      expect(sent!.html).not.toContain('Path Editor')

      // The button signs them in on the way to their account page, and opens
      // it on the tab holding Notification Preferences — a tab Payload offers
      // no URL for, so the link writes the tab Payload remembers instead.
      const link = tokenIn(sent!.html, PAGE_LINK_URL)
      expect(link, 'no settings link in the body').not.toBeNull()
      const answer = await anon(`${REDEEM_PATH}?token=${encodeURIComponent(link!)}`, {
        method: 'POST',
      })
      expect(answer.headers.get('Location')).toBe(`${getServerUrl()}/admin/account`)

      const { docs } = await payload.find({
        collection: 'payload-preferences',
        where: { key: { equals: `collection-managers-${manager.id}` } },
        overrideAccess: true,
      })
      // The shape the admin itself writes when the Contact tab is clicked: the
      // tabs field's position among the top-level fields, and the tab's index.
      expect(docs[0]?.value).toEqual({ fields: { '_index-2': { tabIndex: 1 } } })
    })
  })

  describe('accepting an invitation', () => {
    it('signs the manager in and marks them verified', async () => {
      const { manager, token } = await invite()
      expect(await verifiedFlag(manager.id)).toBeFalsy()

      const response = await accept(token)
      expectAccepted(response)

      const cookie = response.headers.get('Set-Cookie')!
      const asManager = createRestClientWithAuth(env, { Cookie: cookie.split(';')[0]! })
      const me = await asManager('/api/managers/me')
      expect((me.body.user as { id: number | string } | null)?.id).toBe(manager.id)

      expect(await verifiedFlag(manager.id)).toBe(true)
    })

    it('refuses the same invitation a second time', async () => {
      const { token } = await invite()
      expectAccepted(await accept(token))

      // `_verified` is the single-use check here: an invitation stamps no
      // timestamp to compare against. Spent, it says so — the holder is in.
      expectRefused(await accept(token), 'invite-accepted')
    })

    it('spends a sign-in token by the sign-in rules, never as an invitation', async () => {
      const { manager } = await invite()

      // Same claims, valid signature — only the audience differs. The audience
      // picks the rules, and a sign-in link needs a stamp this account never got.
      const signin = await signSigninToken(
        { collection: 'managers', issuedAt: Date.now(), userId: manager.id },
        payload.secret,
      )

      expectRefused(await accept(signin), 'invalid')
      expect(await verifiedFlag(manager.id)).toBeFalsy()
    })

    it('tells an expired invitation from a tampered one', async () => {
      const { manager, token } = await invite()
      const [header, body, signature] = token.split('.')

      expectRefused(await accept(`${header}.${body}.${signature!.slice(0, -2)}xx`), 'invalid')

      // An authentic invitation whose seven days ran out — minted a minute past
      // the lifetime, so the expiry is the only thing left to refuse it. It is
      // the one refusal worth distinguishing, because the copy the page shows
      // states the invitation's own validity, not a sign-in link's.
      const past = new Date(Date.now() - INVITE_TOKEN_TTL_MS - 60_000)
      const aged = await signInviteToken(
        { collection: 'managers', issuedAt: past.getTime(), userId: manager.id },
        payload.secret,
        past,
      )
      expectRefused(await accept(aged), 'invite-expired')
    })

    it('refuses a tampered invitation, and one carrying no token at all', async () => {
      const { token } = await invite()
      const [header, body, signature] = token.split('.')

      expectRefused(await accept(`${header}.${body}.${signature!.slice(0, -2)}xx`), 'invalid')
      expectRefused(await anon(REDEEM_PATH, { method: 'POST' }), 'invalid')
    })

    it('refuses a session until the invitation is accepted, then honours one', async () => {
      const { manager, token } = await invite()

      // ⚠ **The same session token both times**, so the only thing that changed
      // between the two reads is `_verified`. Minting a second one after the
      // accept would pass even if the gate never existed (#840).
      const asManager = createRestClientWithAuth(env, {
        Authorization: `JWT ${await createSession(payload, 'managers', manager.id)}`,
      })

      const before = await asManager('/api/managers/me')
      expect(before.status).toBe(200)
      expect((before.body as { user: unknown }).user).toBeNull()

      expectAccepted(await accept(token))

      const after = await asManager('/api/managers/me')
      expect((after.body as { user?: { email?: string } }).user?.email).toBe(manager.email)
    })

    it('refuses a manager deactivated after the invitation was sent', async () => {
      const { manager, token } = await invite()

      await payload.update({
        collection: 'managers',
        id: manager.id,
        data: { type: 'inactive' },
      })

      expectRefused(await accept(token), 'invalid')
      expect(await verifiedFlag(manager.id)).toBeFalsy()
    })
  })

  describe('following a page link', () => {
    const open = (token: string) =>
      anon(`${REDEEM_PATH}?token=${encodeURIComponent(token)}`, { method: 'POST' })

    const linkFor = (userId: number | string, to = '/admin/collections/events/1') =>
      signLinkToken(
        { collection: 'managers', issuedAt: Date.now(), label: 'An event', to, userId },
        payload.secret,
      )

    it('signs an unaccepted manager in, accepts them, and lands on the page it names', async () => {
      // An imported manager's first email is a verification reminder, and its
      // button is this link — so it must get them in without an invitation.
      const created = await payload.create({
        collection: 'managers',
        data: {
          name: 'Imported',
          email: `link_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
          type: 'manager',
        },
        disableVerificationEmail: true,
      })

      const answer = await open(await linkFor(created.id, '/admin/collections/events/42'))
      expect(answer.status).toBe(302)
      expect(answer.headers.get('Location')).toBe(`${getServerUrl()}/admin/collections/events/42`)
      expect(answer.headers.get('Set-Cookie')).toBeTruthy()
      expect(await verifiedFlag(created.id)).toBe(true)
    })

    it('works more than once — a reminder is clicked twice', async () => {
      const { manager } = await invite()
      const token = await linkFor(manager.id)

      expect((await open(token)).status).toBe(302)
      const again = await open(token)
      expect(again.headers.get('Location')).toBe(`${getServerUrl()}/admin/collections/events/1`)
    })

    it('refuses a manager deactivated since the link was sent', async () => {
      const { manager } = await invite()
      const token = await linkFor(manager.id)
      await payload.update({ collection: 'managers', id: manager.id, data: { type: 'inactive' } })

      expectRefused(await open(token), 'invalid')
    })

  })

  describe('asking for a link', () => {
    /** Ask for a link and hand back the message that arrives. */
    const request = async (email: string) => {
      emailAdapter.clearCapturedEmails()
      await anon(REQUEST_PATH, { method: 'POST', json: { email } })
      return emailAdapter.findEmailByTo(email)
    }

    it('re-sends the invitation to a manager who has never accepted', async () => {
      // The self-service rescue: an imported manager, or one whose invitation
      // was lost, has nothing else that would ever mail them.
      const { manager } = await invite()

      const sent = await request(manager.email)
      expect(sent, 'nothing was sent to an unaccepted manager').toBeDefined()
      expect(tokenIn(sent!.html, INVITE_URL)).not.toBeNull()
      expect(tokenIn(sent!.html, SIGN_IN_URL)).toBeNull()
    })

    it('names everything the manager holds, not just what is new', async () => {
      const { manager } = await invite({
        roles: { en: ['meditations-editor'], fr: ['web-translator'] },
      })
      const region = await testData.createRegion(payload, { managers: [manager.id] })
      const event = await testData.createEvent(payload, {
        title: `Resent Event ${manager.id}`,
        manager: manager.id,
        region: region.id,
      })

      await request(manager.email)
      // One email per project: the App role, the Web role, and the Atlas pair.
      const byProject = Object.fromEntries(
        mailTo(manager.email).map((email) => [email.subject, email.html]),
      )
      expect(Object.keys(byProject).sort()).toEqual(
        [
          "You've been invited to help as Meditations Editor",
          "You've been invited to help as Web Translator",
          "You've been invited to look after 1 region and 1 event",
        ].sort(),
      )
      const atlas = byProject["You've been invited to look after 1 region and 1 event"]!
      expect(atlas).toContain(region.name!)
      expect(atlas).toContain(event.title)
      expect(byProject["You've been invited to help as Web Translator"]).toContain('French')
    })

    it('sends nothing to an unaccepted manager with nothing assigned', async () => {
      // There is nothing to invite them to — and a sign-in link would be
      // refused, since they have never accepted.
      const manager = await bare()

      expect(await request(manager.email)).toBeUndefined()
    })

    it('sends a plain sign-in link once they have accepted', async () => {
      const { manager, token } = await invite()
      expectAccepted(await accept(token))

      const sent = await request(manager.email)
      expect(sent, 'nothing was sent to an accepted manager').toBeDefined()
      expect(tokenIn(sent!.html, SIGN_IN_URL)).not.toBeNull()
      expect(tokenIn(sent!.html, INVITE_URL)).toBeNull()
    })

    it('carries an imported manager all the way in', async () => {
      // The importer's row, start to finish: it queues nothing (the seed runs
      // with invitations off), `_verified` is false, and asking for a link is
      // what delivers the invitation that accepts it.
      const created = await bare()
      await testData.createRegion(payload, { managers: [created.id] })
      await payload.db.updateOne({
        collection: 'managers',
        id: created.id,
        data: { pendingInvitation: null, invitationDueAt: null },
        returning: false,
      })

      const sent = await request(created.email)
      const token = tokenIn(sent?.html, INVITE_URL)
      expect(token, 'an imported manager was sent no invitation').not.toBeNull()

      expectAccepted(await accept(token!))
      expect(await verifiedFlag(created.id)).toBe(true)
    })
  })
})
