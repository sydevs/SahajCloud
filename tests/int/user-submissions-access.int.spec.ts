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

import { buildReminderEntry } from '@/lib/eventVerification/log'
import { relationId } from '@/lib/utilities/relationId'
import type { Client, Event, Form, Manager, UserSubmission } from '@/payload-types'
import { bypassPermissions, hasPermission } from '@/plugins/access'

import { testData } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

describe('User submissions access', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let recipient: Manager
  let otherManager: Manager
  let client: Client
  let adminManager: Manager
  let addressedForm: Form
  let otherForm: Form
  let subscribeForm: Form

  const managerReq = (manager: Manager): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      user: { ...manager, collection: 'managers' },
      locale: 'en',
      context: {},
    }) as unknown as PayloadRequest

  const readAs = (manager: Manager) =>
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

    recipient = await testData.createManager(payload, {
      name: 'Addressed Manager',
      email: 'addressed@example.com',
      roles: ['atlas-manager'],
    })
    otherManager = await testData.createManager(payload, {
      name: 'Other Manager',
      email: 'other-manager@example.com',
      roles: ['atlas-manager'],
    })
    adminManager = await testData.createManager(payload, {
      name: 'Submissions Admin',
      email: 'submissions-admin@example.com',
      type: 'admin',
    })
    client = await testData.createClient(payload, recipient.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    const form = (title: string, manager: Manager) =>
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
    await seed({
      type: 'proposal',
      senderEmail: 'proposer@example.com',
      proposed: { title: 'New' },
    })
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
      expect(contacts[0]!.senderEmail).toBe('mine@example.com')
    })

    it('reads proposals, whoever sent them', async () => {
      const { docs } = await readAs(recipient)
      expect(docs.some((doc) => doc.type === 'proposal')).toBe(true)
    })

    it('reads no registration or subscription at all', async () => {
      // Consent and attendance records. No manager task reads them, and one
      // collection-wide grant would otherwise hand over every registrant's
      // address along with the proposals they do need.
      const { docs } = await readAs(recipient)
      expect(docs.some((doc) => doc.type === 'registration')).toBe(false)
      expect(docs.some((doc) => doc.type === 'subscribe')).toBe(false)
    })

    it('shows a manager addressed by nothing only the proposals', async () => {
      const { docs } = await readAs(otherManager)
      // Their own addressed row is the one contact they see — the scope is per
      // manager, not "any contact row".
      const contacts = docs.filter((doc) => doc.type === 'contact')
      expect(contacts).toHaveLength(1)
      expect(contacts[0]!.senderEmail).toBe('theirs@example.com')
    })
  })

  describe('the Users join', () => {
    it('does not hand a manager rows the per-row scope withholds', async () => {
      // `Users.submissions` is a join on `user-submissions.user`, and
      // `atlas-manager` holds `users: ['read']` — so if a join ran outside the
      // joined collection's access, reading a registrant would return every
      // submission they ever sent, contact messages addressed to somebody else
      // included. That is the leak worth asserting; the join's usefulness is
      // not.
      const asUser = (options: { overrideAccess: boolean; req?: PayloadRequest }) =>
        payload.find({
          collection: 'users',
          where: { email: { equals: 'theirs@example.com' } },
          depth: 1,
          limit: 1,
          ...options,
        })

      // The control. Without it a zero below could mean the join never
      // populates, which would prove nothing about access at all.
      const asAdmin = await asAdminRead()
      expect(asAdmin.docs).toHaveLength(1)
      expect(asAdmin.docs[0]!.submissions?.docs ?? []).toHaveLength(1)

      const { docs } = await asUser({ overrideAccess: false, req: managerReq(recipient) })
      // The manager really can read the registrant — so the empty join below
      // is the access layer's doing, not a missing row.
      expect(docs).toHaveLength(1)
      expect(docs[0]!.submissions?.docs ?? []).toHaveLength(0)

      // ⚠ The positive half, and the zero above means nothing without it.
      // `?? []` cannot tell "the join was filtered to nothing" from "the join
      // does not populate on a non-override read at all" — so read a sender
      // whose only row IS in scope, and require it to come back.
      const inScope = await payload.find({
        collection: 'users',
        where: { email: { equals: 'proposer@example.com' } },
        depth: 1,
        limit: 1,
        overrideAccess: false,
        req: managerReq(recipient),
      })
      expect(inScope.docs).toHaveLength(1)
      expect(inScope.docs[0]!.submissions?.docs ?? []).toHaveLength(1)

      async function asAdminRead() {
        return asUser({ overrideAccess: true })
      }
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

    it('refuses a manager who may read the Registrant', async () => {
      const id = await registrantId()
      // The read grant is what makes the refusal meaningful: this manager can
      // see the record, so only the write gate stops them blocking the sender.
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
      ).toBe(true)

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
      expect(docs).toHaveLength(5)
      expect(new Set(docs.map((doc) => doc.type)).size).toBe(4)
    })
  })

  // #1047. A delivery entry's `sentTo` is the address the review mail went to
  // — the event's manager, or the region manager up its chain — and every
  // manager reads every proposal. So the address narrows per reader: the
  // managers of the event or region the proposal is for, its owner, admins.
  describe('who reads a delivery address', () => {
    const EVENT_MANAGER = 'sub-event-manager@example.com'
    const REGION_MANAGER = 'sub-region-manager@example.com'
    const OUTSIDER = 'sub-outsider@example.com'

    let eventManager: Manager
    let regionManager: Manager
    let outsider: Manager
    let event: Event
    let updateProposal: UserSubmission
    let newProposal: UserSubmission
    let contactRow: UserSubmission

    const delivered = (sentTo: string) => ({
      at: '2026-10-30T09:00:00.000Z',
      type: 'delivery',
      key: '2026-10-30T09:00:00.000Z',
      ok: true,
      cells: { activity: 'Delivered', sentTo },
    })

    const writeLog = (id: number, log: unknown[]) =>
      payload.update({
        collection: 'user-submissions',
        id,
        data: { activityLog: log } as never,
        overrideAccess: true,
        context: { skipWriteGuard: true },
      })

    const stored = async (id: number) =>
      (await payload.findByID({ collection: 'user-submissions', id, overrideAccess: true }))
        .activityLog as unknown[]

    const sentTo = async (manager: Manager, id: number, depth = 0) => {
      const doc = await payload.findByID({
        collection: 'user-submissions',
        id,
        depth,
        overrideAccess: false,
        req: managerReq(manager),
      })
      const entry = (doc.activityLog as { type: string; cells: Record<string, unknown> }[]).find(
        (logEntry) => logEntry.type === 'delivery',
      )
      expect(entry, 'the entry itself survives every reader').toMatchObject({
        at: '2026-10-30T09:00:00.000Z',
        cells: { activity: 'Delivered' },
      })
      return { sentTo: entry!.cells.sentTo, doc }
    }

    beforeAll(async () => {
      eventManager = await testData.createManager(payload, {
        name: 'Sub Event Manager',
        email: EVENT_MANAGER,
        roles: ['atlas-manager'],
      })
      regionManager = await testData.createManager(payload, {
        name: 'Sub Region Manager',
        email: REGION_MANAGER,
        roles: ['atlas-manager'],
      })
      outsider = await testData.createManager(payload, {
        name: 'Sub Outsider',
        email: OUTSIDER,
        roles: ['atlas-manager'],
      })
      const country = await testData.createRegion(payload, {
        name: 'Sub Country',
        level: 'country',
        managers: [regionManager.id],
      })
      const city = await testData.createRegion(payload, { name: 'Sub City', parent: country.id })
      await testData.createRegion(payload, { name: 'Sub Elsewhere', managers: [outsider.id] })

      event = await testData.createEvent(payload, {
        title: 'Sub Event',
        manager: eventManager.id,
        region: city.id,
      })
      // An address on the event's own log too, for the depth-1 read below.
      await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        context: { skipVerifyHook: true },
        data: {
          activityLog: [
            buildReminderEntry({
              stage: 'verified',
              level: 'due',
              role: 'manager',
              manager: { id: eventManager.id, name: eventManager.name },
              channel: 'email',
              destination: EVENT_MANAGER,
              at: new Date().toISOString(),
            }),
          ],
        } as never,
      })

      updateProposal = await seed({
        type: 'proposal',
        event: event.id,
        senderEmail: 'sub-update@example.com',
        proposed: { title: 'Renamed' },
      })
      newProposal = await seed({
        type: 'proposal',
        region: city.id,
        senderEmail: 'sub-new@example.com',
        proposed: { title: 'Brand new' },
      })
      contactRow = await seed({
        type: 'contact',
        form: addressedForm.id,
        senderEmail: 'sub-contact@example.com',
        submissionData: [{ field: 'message', value: 'Hello.' }],
      })
      await writeLog(updateProposal.id, [delivered(EVENT_MANAGER)])
      await writeLog(newProposal.id, [delivered(REGION_MANAGER)])
      await writeLog(contactRow.id, [delivered(recipient.email)])
    })

    it('stores every address, so a hidden one below is the narrowing', async () => {
      expect(JSON.stringify(await stored(updateProposal.id))).toContain(EVENT_MANAGER)
      expect(JSON.stringify(await stored(newProposal.id))).toContain(REGION_MANAGER)
    })

    it('hides the address from an atlas-manager outside the region', async () => {
      expect((await sentTo(outsider, updateProposal.id)).sentTo).toBeUndefined()
      expect((await sentTo(outsider, newProposal.id)).sentTo).toBeUndefined()
    })

    it('hides it on the populated event, and keeps the event log out of the preview', async () => {
      const { doc } = await sentTo(outsider, updateProposal.id, 1)
      expect((doc.event as Event).title).toBe('Sub Event')
      expect(doc.previewEvent).toMatchObject({ title: 'Renamed' })
      expect(doc.previewEvent).not.toHaveProperty('activityLog')
      expect(JSON.stringify(doc)).not.toContain(EVENT_MANAGER)
    })

    it('shows the region manager above the event or region either address', async () => {
      expect((await sentTo(regionManager, updateProposal.id)).sentTo).toBe(EVENT_MANAGER)
      expect((await sentTo(regionManager, newProposal.id)).sentTo).toBe(REGION_MANAGER)
    })

    it('places a list of proposals on one events query, however many targets it names', async () => {
      const second = await testData.createEvent(payload, {
        title: 'Sub Event Two',
        manager: eventManager.id,
        region: relationId(event.region)!,
      })
      const another = await seed({
        type: 'proposal',
        event: second.id,
        senderEmail: 'sub-update-two@example.com',
        proposed: { title: 'Renamed too' },
      })
      await writeLog(another.id, [delivered(EVENT_MANAGER)])

      const findByID = vi.spyOn(payload, 'findByID')
      const find = vi.spyOn(payload, 'find')
      try {
        const { docs } = await payload.find({
          collection: 'user-submissions',
          where: { id: { in: [updateProposal.id, another.id] } },
          depth: 0,
          overrideAccess: false,
          req: managerReq(regionManager),
        })
        const addresses = docs.map(
          (doc) => (doc.activityLog as { cells: { sentTo?: string } }[])[0]!.cells.sentTo,
        )
        expect(addresses).toEqual([EVENT_MANAGER, EVENT_MANAGER])
        // A list read skips the preview's own target load (`findMany`), so
        // these are the address check's alone: one set for the reader, not
        // one event per row.
        const eventReads = [...findByID.mock.calls, ...find.mock.calls].filter(
          ([args]) => args.collection === 'events',
        )
        expect(eventReads).toHaveLength(1)
      } finally {
        findByID.mockRestore()
        find.mockRestore()
      }
    })

    it("shows the event's manager their own proposal's address, and not another region's", async () => {
      expect((await sentTo(eventManager, updateProposal.id)).sentTo).toBe(EVENT_MANAGER)
      expect((await sentTo(eventManager, newProposal.id)).sentTo).toBeUndefined()
    })

    it('shows a manager their own address with no region at all', async () => {
      expect((await sentTo(recipient, contactRow.id)).sentTo).toBe(recipient.email)
    })

    it('shows an admin every address', async () => {
      expect((await sentTo(adminManager, updateProposal.id)).sentTo).toBe(EVENT_MANAGER)
      expect((await sentTo(adminManager, newProposal.id)).sentTo).toBe(REGION_MANAGER)
    })

    // A guard on the collection restriction, not on the narrowing: a client
    // key reaches no submission row at all, so it reaches no log.
    it('gives an API client no log, because it reads no row', async () => {
      const req = {
        ...createClientAuthenticatedRequest(client.id, 'unused', ['sahaj-atlas-client']),
        payload,
        context: {},
      } as unknown as PayloadRequest
      await expect(
        payload.findByID({
          collection: 'user-submissions',
          id: updateProposal.id,
          select: { activityLog: true },
          depth: 0,
          overrideAccess: false,
          req,
        }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('loses no address when an outsider saves back the log they were shown', async () => {
      // The admin form posts the value it rendered — redacted, for this reader.
      const { doc } = await sentTo(outsider, newProposal.id)
      await payload.update({
        collection: 'user-submissions',
        id: newProposal.id,
        data: { activityLog: doc.activityLog } as never,
        overrideAccess: false,
        req: managerReq(outsider),
      })
      expect(JSON.stringify(await stored(newProposal.id))).toContain(REGION_MANAGER)
    })

    it('loses no address when an outsider decides the proposal', async () => {
      // `applyReview` appends to the log its own update's afterRead left, which
      // the narrowing has already run on.
      await payload.update({
        collection: 'user-submissions',
        id: updateProposal.id,
        data: { status: 'rejected' },
        overrideAccess: false,
        req: managerReq(outsider),
      })
      const log = (await stored(updateProposal.id)) as { type: string }[]
      expect(log.map((entry) => entry.type)).toEqual(['delivery', 'review'])
      expect(JSON.stringify(log)).toContain(EVENT_MANAGER)
    })

    it('refuses a filter on the log to a non-admin', async () => {
      const probe = (collection: 'user-submissions' | 'users', where: Record<string, unknown>) =>
        payload.find({
          collection,
          where: where as never,
          depth: 0,
          overrideAccess: false,
          req: managerReq(outsider),
        })
      for (const where of [
        { 'activityLog.cells.sentTo': { equals: EVENT_MANAGER } },
        { AND: [{ 'activityLog.cells.sentTo': { like: 'sub-event' } }] },
        // A hop into the target event's log, from the collection that names it.
        { 'event.activityLog.destination': { like: 'sub-event' } },
      ]) {
        await expect(probe('user-submissions', where), JSON.stringify(where)).rejects.toMatchObject(
          { status: 400 },
        )
      }
      // And through the Users join, which never runs this collection's hooks.
      await expect(
        payload.find({
          collection: 'users',
          joins: { submissions: { where: { 'activityLog.cells.sentTo': { like: 'sub' } } } },
          depth: 1,
          overrideAccess: false,
          req: managerReq(outsider),
        }),
      ).rejects.toMatchObject({ status: 400 })
      // And over a bulk update, whose returned rows would answer the same question.
      await expect(
        payload.update({
          collection: 'user-submissions',
          where: { 'activityLog.cells.sentTo': { like: 'sub-event' } },
          data: {},
          overrideAccess: false,
          req: managerReq(outsider),
        }),
      ).rejects.toMatchObject({ status: 400 })
    })
  })
})
