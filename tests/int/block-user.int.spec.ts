/**
 * The Block / Unblock button's endpoint (`POST /api/users/:id/block`), and the
 * two rules on `users` that keep a submission's sender stable: the address is
 * normalized on every write, and a Registrant with submissions cannot be
 * deleted out from under them.
 *
 * Driven over REST, because the gate under test is the endpoint's own and the
 * status moves it makes are ones the status machine refuses a manager's request.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest'

import { asLog } from '@/fields'
import { DeliverSubmissions } from '@/jobs/DeliverSubmissions/DeliverSubmissions'
import type { Manager, User, UserSubmission } from '@/payload-types'

import { createRestClientAs, type RestClient } from '../utils/restRequest'
import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Blocking a sender', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminRest: RestClient
  let managerRest: RestClient
  let contactFormId: number

  const createSender = (email: string) =>
    payload.create({
      collection: 'users',
      data: createData<'users'>({ name: 'Sender', email }),
    }) as Promise<User>

  const createSubmission = (user: User, status: UserSubmission['status'], message: string) =>
    payload.create({
      collection: 'user-submissions',
      data: createData<'user-submissions'>({
        type: 'contact',
        form: contactFormId,
        senderEmail: user.email,
        status,
        submissionData: [{ field: 'message', value: message }],
      }),
    }) as Promise<UserSubmission>

  const reload = (id: number) => payload.findByID({ collection: 'user-submissions', id, depth: 0 })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    adminRest = await createRestClientAs(env, env.adminUser)
    const atlasManager: Manager = await testData.createManager(payload, { name: 'Atlas Manager' })
    // The listing is the role (#1068). The REST client's JWT strategy re-reads
    // the manager, joins included, so it resolves `atlas-region-manager`.
    await testData.createRegion(payload, { managers: [atlasManager.id] })
    managerRest = await createRestClientAs(env, atlasManager)

    const form = await payload.create({
      collection: 'forms',
      data: {
        title: 'Contact us',
        actionType: 'contact',
        recipient: env.adminUser.id,
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'email', name: 'email', label: 'Email' },
          { blockType: 'textarea', name: 'message', label: 'Message' },
        ],
      } as never,
    })
    contactFormId = form.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('POST /api/users/:id/block', () => {
    it('refuses an Atlas manager, who holds no grant on Registrants', async () => {
      const sender = await createSender('refused-block@example.com')

      const { status } = await managerRest(`/api/users/${sender.id}/block`, {
        method: 'POST',
        json: { blocked: true },
      })

      expect(status).toBe(403)
      const stored = await payload.findByID({ collection: 'users', id: sender.id })
      expect(stored.blockedAt).toBeFalsy()
    })

    it('blocks and refuses every pending submission, leaving other senders alone', async () => {
      const sender = await createSender('nuisance@example.com')
      const pending = await createSubmission(sender, 'pending', 'Still waiting.')
      const second = await createSubmission(sender, 'pending', 'Also waiting.')
      const bystander = await createSubmission(
        await createSender('bystander@example.com'),
        'pending',
        'Someone else entirely.',
      )

      const { status, body } = await adminRest(`/api/users/${sender.id}/block`, {
        method: 'POST',
        json: { blocked: true, reason: 'Repeated junk.', submission: pending.id },
      })

      expect(status).toBe(200)
      expect(body.markedSpam).toBe(2)

      const user = await payload.findByID({ collection: 'users', id: sender.id })
      expect(user.blockedAt).toEqual(expect.any(String))
      expect(user.blockedReason).toBe('Repeated junk.')

      for (const id of [pending.id, second.id]) {
        const row = await reload(id)
        expect(row.status).toBe('spam')
        expect(row.screeningResult?.verdict).toBe('blocked_sender')
        expect(asLog(row.activityLog)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'block',
              cells: { activity: expect.stringContaining('Repeated junk.') },
            }),
          ]),
        )
      }
      expect((await reload(bystander.id)).status).toBe('pending')
    })

    it('leaves the accepted row it was pressed on delivered, and still active', async () => {
      const sender = await createSender('late-block@example.com')
      const accepted = await createSubmission(sender, 'accepted', 'Delivered last week.')

      const { status, body } = await adminRest(`/api/users/${sender.id}/block`, {
        method: 'POST',
        json: { blocked: true, submission: accepted.id },
      })

      expect(status).toBe(200)
      expect(body.markedSpam).toBe(0)

      // `spam` sits in INACTIVE_STATUSES, so refusing this row would drop a real
      // registration out of fullness and reminders.
      const row = await reload(accepted.id)
      expect(row.status).toBe('accepted')
      expect(row.screeningResult?.verdict).not.toBe('blocked_sender')
    })

    it('unblocks, keeps the reason, and brings no refused row back', async () => {
      const sender = await createSender('forgiven@example.com')
      const row = await createSubmission(sender, 'pending', 'Before the block.')
      await adminRest(`/api/users/${sender.id}/block`, {
        method: 'POST',
        json: { blocked: true, reason: 'A mistake.', submission: row.id },
      })

      const { status } = await adminRest(`/api/users/${sender.id}/block`, {
        method: 'POST',
        json: { blocked: false, submission: row.id },
      })

      expect(status).toBe(200)
      const user = await payload.findByID({ collection: 'users', id: sender.id })
      expect(user.blockedAt).toBeFalsy()
      expect(user.blockedReason).toBe('A mistake.')

      const after = await reload(row.id)
      expect(after.status).toBe('spam')
      expect(asLog(after.activityLog).map((entry) => entry.type)).toEqual(
        expect.arrayContaining(['block', 'unblock']),
      )
    })

    it('clears the kept reason when the next block is posted without one', async () => {
      const sender = await createSender('reblocked@example.com')
      await adminRest(`/api/users/${sender.id}/block`, {
        method: 'POST',
        json: { blocked: true, reason: 'The first time.' },
      })
      await adminRest(`/api/users/${sender.id}/block`, { method: 'POST', json: { blocked: false } })

      const { body } = await adminRest(`/api/users/${sender.id}/block`, {
        method: 'POST',
        json: { blocked: true },
      })

      expect(body.blockedReason).toBeNull()
      const user = await payload.findByID({ collection: 'users', id: sender.id })
      expect(user.blockedReason).toBeFalsy()
    })

    it('keeps a block that lands while the submission is being delivered', async () => {
      // The interleave: delivery reads the row, spends seconds sending, then
      // writes its status. A block landing in that window used to be put back
      // to `accepted` — and the block's own log entry overwritten with it.
      const sender = await createSender('blocked-mid-send@example.com')
      const pending = await createSubmission(sender, 'pending', 'In flight.')

      const sendEmail = vi.spyOn(payload, 'sendEmail').mockImplementation(async () => {
        await adminRest(`/api/users/${sender.id}/block`, {
          method: 'POST',
          json: { blocked: true, reason: 'Caught mid-send.' },
        })
        return {} as never
      })
      onTestFinished(() => sendEmail.mockRestore())

      await runTaskHandler(DeliverSubmissions, {
        payload,
        input: { submissionId: pending.id },
      })

      const row = await reload(pending.id)
      // The block is the newer answer, and the delivery really did happen.
      expect(row.status).toBe('spam')
      expect(row.screeningResult?.verdict).toBe('blocked_sender')
      expect(asLog(row.activityLog)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'block' }),
          expect.objectContaining({ type: 'delivery', ok: true }),
        ]),
      )
    })

    it('answers 404 for a Registrant that does not exist', async () => {
      const { status } = await adminRest('/api/users/999999/block', {
        method: 'POST',
        json: { blocked: true },
      })
      expect(status).toBe(404)
    })
  })

  describe('a Registrant with submissions', () => {
    it('cannot be deleted, and can once their submissions are gone', async () => {
      const sender = await createSender('kept@example.com')
      const row = await createSubmission(sender, 'pending', 'Keeps its sender.')

      await expect(payload.delete({ collection: 'users', id: sender.id })).rejects.toThrow(
        /still has 1 submission/,
      )
      expect((await reload(row.id)).senderEmail).toBe('kept@example.com')

      await payload.delete({ collection: 'user-submissions', id: row.id })
      await payload.delete({ collection: 'users', id: sender.id })
      const { totalDocs } = await payload.count({
        collection: 'users',
        where: { id: { equals: sender.id } },
      })
      expect(totalDocs).toBe(0)
    })
  })

  describe('the Registrant address', () => {
    it('is normalized on an admin’s write as well as the public upsert', async () => {
      const sender = await createSender('  Mixed.Case@Example.COM ')
      expect(sender.email).toBe('mixed.case@example.com')

      const edited = await payload.update({
        collection: 'users',
        id: sender.id,
        data: { email: 'Corrected@Example.com' },
      })
      expect(edited.email).toBe('corrected@example.com')
    })
  })
})
