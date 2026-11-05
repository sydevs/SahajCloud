/**
 * Who may read, create and update `user-submissions` (#723).
 *
 * The collection folds four intakes into one table, so the access rules that
 * used to be spread over three collections now have to be told apart *by row*.
 * Two halves, and both matter:
 *
 * - the query-free grants (`hasPermission`), which say whether a role reaches
 *   the collection at all;
 * - the per-row narrowing in `createAccessConfig`, which is the only thing
 *   stopping a manager's proposal grant from also handing them every
 *   registrant's address.
 *
 * The read cases go through `payload.find` with `overrideAccess: false`, so the
 * `Where` the access layer returns is actually applied. Asserting the grant
 * alone would say nothing about which rows come back.
 *
 * `users` is here too, for the two places a submission's sender is reachable
 * from: the join a manager reads them through, and the block an admin sets on
 * them (#630).
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Client, Form, Manager, UserSubmission } from '@/payload-types'
import { bypassPermissions, hasPermission } from '@/plugins/access'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

describe('User submissions access', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  type AuthManager = Awaited<ReturnType<typeof testData.authUser>>
  let recipient: AuthManager
  let otherManager: AuthManager
  /** Named on one event in `otherManager`'s subtree — `atlas-event-manager` alone. */
  let eventAssignee: AuthManager
  let client: Client
  let adminManager: Manager
  let addressedForm: Form
  let otherForm: Form
  let subscribeForm: Form
  /** Proposal rows, by where each one lands on the region tree. */
  let proposals: Record<
    'byRoutingRegion' | 'elsewhere' | 'inSubtree' | 'onAssignedEvent' | 'strandedHint',
    number
  >

  const managerReq = (manager: AuthManager | Manager): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      user: { ...manager, collection: 'managers' },
      locale: 'en',
      context: {},
    }) as unknown as PayloadRequest

  const readAs = (manager: AuthManager) =>
    payload.find({
      collection: 'user-submissions',
      depth: 0,
      pagination: false,
      overrideAccess: false,
      req: managerReq(manager),
    }) as Promise<{ docs: UserSubmission[] }>

  const seed = (data: Record<string, unknown>) =>
    payload.create({
      collection: 'user-submissions',
      data: data as never,
      overrideAccess: true,
    }) as Promise<UserSubmission>

  beforeAll(async () => {
    verifyMock.mockResolvedValue({ success: true })

    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const addressed = await testData.createManager(payload, {
      name: 'Addressed Manager',
      email: 'addressed@example.com',
      roles: [],
    })
    const other = await testData.createManager(payload, {
      name: 'Other Manager',
      email: 'other-manager@example.com',
      roles: [],
    })
    const assignee = await testData.createManager(payload, {
      name: 'Event Assignee',
      email: 'event-assignee@example.com',
      roles: [],
    })
    adminManager = await testData.createManager(payload, {
      name: 'Submissions Admin',
      email: 'submissions-admin@example.com',
      type: 'admin',
    })
    // Two subtrees, each with its own region manager, plus a city neither owns.
    // `atlas-region-manager` is derived from these listings, so each manager has
    // to be re-read once theirs exists — see `testData.authUser`.
    const mine = await testData.createRegion(payload, {
      name: 'Mineland',
      level: 'country',
      managers: [addressed.id],
    })
    const myCity = await testData.createRegion(payload, {
      name: 'Mine City',
      level: 'city',
      parent: mine.id,
    })
    const theirs = await testData.createRegion(payload, {
      name: 'Theirsland',
      level: 'country',
      managers: [other.id],
    })
    const theirCity = await testData.createRegion(payload, {
      name: 'Their City',
      level: 'city',
      parent: theirs.id,
    })
    const nobodys = await testData.createRegion(payload, { name: 'Nobody City', level: 'city' })
    recipient = await testData.authUser(payload, addressed)
    otherManager = await testData.authUser(payload, other)

    const assignedEvent = await testData.createEvent(payload, {
      title: 'Assigned Event',
      manager: assignee.id,
      region: theirCity.id,
      _status: 'published',
    })
    eventAssignee = await testData.authUser(payload, assignee)

    client = await testData.createClient(payload, recipient.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    const form = (title: string, manager: AuthManager) =>
      payload.create({
        collection: 'forms',
        data: {
          title,
          actionType: 'contact',
          recipient: manager.id,
          confirmationType: 'redirect',
          redirect: { url: '/thanks' },
          fields: [
            { blockType: 'email', name: 'email', label: 'Email' },
            { blockType: 'textarea', name: 'message', label: 'Message' },
          ],
        } as never,
        overrideAccess: true,
      }) as Promise<Form>

    addressedForm = await form('Addressed to me', recipient)
    otherForm = await form('Addressed to someone else', otherManager)

    // Its own form: a submission's `type` must agree with the form's
    // `actionType`, so a subscribe row cannot be seeded against a contact form.
    subscribeForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Newsletter',
        actionType: 'subscribe',
        client: client.id,
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [{ blockType: 'email', name: 'email', label: 'Email' }],
      } as never,
      overrideAccess: true,
    })) as Form

    await seed({
      type: 'contact',
      form: addressedForm.id,
      senderEmail: 'mine@example.com',
      submissionData: [{ field: 'message', value: 'For the addressed manager.' }],
    })
    await seed({
      type: 'contact',
      form: otherForm.id,
      senderEmail: 'theirs@example.com',
      submissionData: [{ field: 'message', value: 'For somebody else.' }],
    })
    // One proposal per way a reviewer can be responsible for it. The hint row
    // is the load-bearing one: a city the atlas does not hold yet leaves
    // `region` null, and `deliverProposal` mails the state or country manager
    // — who must be able to read what they were told to review.
    const proposal = async (data: Record<string, unknown>) =>
      (
        await seed({
          type: 'proposal',
          senderEmail: 'proposer@example.com',
          proposed: { title: 'New' },
          ...data,
        })
      ).id
    proposals = {
      inSubtree: await proposal({ region: myCity.id }),
      byRoutingRegion: await proposal({ routingRegion: mine.id }),
      // A row written before #1068 added the column: its routing region lives
      // only in the JSON hint the access clause no longer queries. The
      // migration backfills these, and until it runs one is admin-only.
      strandedHint: await proposal({ regionHint: { country: mine.id } }),
      onAssignedEvent: await proposal({ event: assignedEvent.id }),
      elsewhere: await proposal({ region: nobodys.id }),
    }
    await seed({ type: 'registration', senderEmail: 'registrant@example.com' })
    await seed({ type: 'subscribe', form: subscribeForm.id, senderEmail: 'sub@example.com' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('clients', () => {
    const clientUser = { id: 1, collection: 'clients', roles: ['sahaj-atlas-client'] } as never
    const webClient = { id: 2, collection: 'clients', roles: ['wemeditate-web-client'] } as never

    it('may create and nothing else', () => {
      for (const user of [clientUser, webClient]) {
        expect(hasPermission({ user, collection: 'user-submissions', operation: 'create' })).toBe(
          true,
        )
        for (const operation of ['read', 'update', 'delete'] as const) {
          expect(
            hasPermission({ user, collection: 'user-submissions', operation }),
            `client should not ${operation}`,
          ).toBe(false)
        }
      }
    })

    it('gets no implicit read from project membership', async () => {
      // The collection left the `wemeditate-web` project when it stopped being
      // `form-submissions`. Being in no project is not restrictive on its own —
      // it means "shared, readable by every role" — so RESTRICTED_COLLECTIONS
      // is what closes it. This asserts the outcome, not the mechanism.
      await expect(
        payload.find({
          collection: 'user-submissions',
          depth: 0,
          overrideAccess: false,
          req: {
            payload,
            headers: new Headers(),
            user: { ...client, collection: 'clients' },
            context: {},
          } as unknown as PayloadRequest,
        }),
      ).rejects.toThrow()
    })
  })

  describe('managers', () => {
    it('reads the contact rows addressed to them, and no other contact row', async () => {
      const { docs } = await readAs(recipient)
      const contacts = docs.filter((doc) => doc.type === 'contact')

      expect(contacts).toHaveLength(1)
      expect(contacts[0]!.form).toBe(addressedForm.id)
    })

    it('reads a contact row without its sender address', async () => {
      // ⚠ Deliberate: `senderEmail` is `virtual: 'user.email'` (#1060), resolved
      // under the reader's access, and no manager role reads `users` (#1068).
      // The recipient gets the address in the delivery mail's `replyTo`, which
      // `deliverContact` reads with `overrideAccess`.
      const { docs } = await readAs(recipient)
      const contact = docs.find((doc) => doc.type === 'contact')
      expect(contact?.user).toEqual(expect.any(Number))
      expect(contact?.senderEmail).toBeUndefined()
    })

    it('reads the proposals landing in their own subtree, and no other', async () => {
      const seen = (await readAs(recipient)).docs.map((doc) => doc.id)
      // Placed in their subtree, and routed to their country because the city
      // is not on the atlas yet — both are theirs to review.
      expect(seen).toContain(proposals.inSubtree)
      expect(seen).toContain(proposals.byRoutingRegion)
      // Another manager's subtree, and a city nobody owns.
      expect(seen).not.toContain(proposals.onAssignedEvent)
      expect(seen).not.toContain(proposals.elsewhere)
    })

    it('reads a proposal on an event in their subtree, through the event', async () => {
      const seen = (await readAs(otherManager)).docs.map((doc) => doc.id)
      expect(seen).toContain(proposals.onAssignedEvent)
      expect(seen).not.toContain(proposals.inSubtree)
      expect(seen).not.toContain(proposals.byRoutingRegion)
      expect(seen).not.toContain(proposals.elsewhere)
    })

    it('no longer reaches a row routed only by the JSON hint', async () => {
      // ⚠ The deliberate cutover in #1068, pinned so it is visible rather than
      // discovered. `regionHint.country` was a queried path until the routing
      // region became an indexed column; the migration backfills every row
      // from the hint, so a stranded row means the backfill did not run.
      const seen = (await readAs(recipient)).docs.map((doc) => doc.id)
      expect(seen).not.toContain(proposals.strandedHint)
    })

    it('shows an event assignee the proposals on their own events alone', async () => {
      const seen = (await readAs(eventAssignee)).docs.map((doc) => doc.id)
      expect(seen).toEqual([proposals.onAssignedEvent])
    })

    it('reads no registration or subscription at all', async () => {
      // Consent and attendance records. No manager task reads them, and one
      // collection-wide grant would otherwise hand over every registrant's
      // address along with the proposals they do need.
      const { docs } = await readAs(recipient)
      expect(docs.some((doc) => doc.type === 'registration')).toBe(false)
      expect(docs.some((doc) => doc.type === 'subscribe')).toBe(false)
    })

    it('scopes the contact rows per manager, not to "any contact row"', async () => {
      const { docs } = await readAs(otherManager)
      const contacts = docs.filter((doc) => doc.type === 'contact')
      expect(contacts).toHaveLength(1)
      expect(contacts[0]!.form).toBe(otherForm.id)
    })
  })

  describe('the Users join', () => {
    it('is unreachable, because no manager role reads a registrant', async () => {
      // `Users.submissions` is a join on `user-submissions.user`, so a join
      // running outside the joined collection's access would hand a manager
      // reading a registrant every submission that registrant ever sent —
      // contact messages addressed to somebody else included. The Atlas role
      // held `users: ['read']` and made that reachable; #1068 withdrew it,
      // since registrations moved to `user-submissions` (#723) and nothing
      // needs it. So the leak is now closed one layer earlier, and this is the
      // layer to assert.
      //
      // ⚠ Should any role regain `users: ['read']`, this case has to go back
      // to asserting the join's own scope: read the registrant as that role
      // and require `submissions.docs` to hold only the rows the per-row scope
      // admits. A read refused by the collection proves nothing about a join.
      for (const manager of [recipient, otherManager, eventAssignee]) {
        await expect(
          payload.find({
            collection: 'users',
            where: { email: { equals: 'theirs@example.com' } },
            depth: 1,
            limit: 1,
            overrideAccess: false,
            req: managerReq(manager),
          }),
          `${manager.name} should not read a registrant`,
        ).rejects.toThrow(/not allowed to perform this action/i)
      }

      // The control: the row is there, and the join does populate — so the
      // refusals above are the access layer's doing, not a missing fixture.
      const asAdmin = await payload.find({
        collection: 'users',
        where: { email: { equals: 'theirs@example.com' } },
        depth: 1,
        limit: 1,
        overrideAccess: true,
      })
      expect(asAdmin.docs).toHaveLength(1)
      expect(asAdmin.docs[0]!.submissions?.docs ?? []).toHaveLength(1)
    })
  })

  /**
   * The block is an admin's decision, and `users` grants write to no role at
   * all — so there is no field access on the column and this is what says so.
   */
  describe('the block on a Registrant', () => {
    const registrantId = async () => {
      const { docs } = await payload.find({
        collection: 'users',
        where: { email: { equals: 'registrant@example.com' } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      return docs[0]!.id
    }

    const blockAs = (manager: Manager, id: number, blockedAt: string | null) =>
      payload.update({
        collection: 'users',
        id,
        data: { blockedAt, blockedReason: blockedAt ? 'Repeated junk.' : null },
        overrideAccess: false,
        req: managerReq(manager),
      })

    it('refuses an Atlas manager, who may neither read nor write a Registrant', async () => {
      const id = await registrantId()
      // `users` is restricted and no manager role names it (#1068), so the
      // refusal comes from the collection, not from the column.
      expect(
        hasPermission(
          {
            user: { ...recipient, collection: 'managers' } as never,
            collection: 'users',
            operation: 'read',
            locale: 'en',
          },
          bypassPermissions,
        ),
      ).toBe(false)

      await expect(blockAs(recipient, id, new Date().toISOString())).rejects.toThrow(
        'not allowed to perform this action',
      )
    })

    /**
     * The Block button's endpoint is the one way in, because a block also
     * refuses the sender's open submissions — a hand-set date would not.
     * `block-user.int.spec.ts` covers the endpoint.
     */
    it('ignores even an admin’s direct write of the block date', async () => {
      const id = await registrantId()

      const written = await blockAs(adminManager, id, new Date().toISOString())
      expect(written.blockedAt).toBeFalsy()
      // The reason is still a plain field: an admin may amend it.
      expect(written.blockedReason).toBe('Repeated junk.')
    })

    /**
     * ⚠ `admin.hidden: true` unregisters a collection's routes as well as
     * hiding its nav entry, so the admin who sets a block has to be able to
     * open the record at all — and the manager who may not must still get
     * neither surface.
     */
    it('opens the Registrant route to an admin and to nobody else', () => {
      const hidden = payload.collections.users.config.admin.hidden
      expect(typeof hidden).toBe('function')
      const ask = (user: unknown) => (hidden as (args: { user: unknown }) => boolean)({ user })

      expect(ask({ ...adminManager, collection: 'managers' })).toBe(false)
      expect(ask({ ...recipient, collection: 'managers' })).toBe(true)
      expect(ask(null)).toBe(true)
    })
  })

  describe('admins', () => {
    it('read everything', async () => {
      const admin = { id: 3, collection: 'managers', type: 'admin' } as never
      expect(
        hasPermission(
          { user: admin, collection: 'user-submissions', operation: 'read' },
          bypassPermissions,
        ),
      ).toBe(true)

      // Read AS the admin, not around access — `overrideAccess: true` skips the
      // very rules this case is named for and would only prove the seed ran.
      const { docs } = await payload.find({
        collection: 'user-submissions',
        depth: 0,
        pagination: false,
        overrideAccess: false,
        req: {
          payload,
          headers: new Headers(),
          user: { ...adminManager, collection: 'managers' },
          locale: 'en',
          context: {},
        } as unknown as PayloadRequest,
      })
      // Two contact rows, five proposals, one registration, one subscription.
      expect(docs).toHaveLength(9)
      expect(new Set(docs.map((doc) => doc.type)).size).toBe(4)
    })
  })
})
