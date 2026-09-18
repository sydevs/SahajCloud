/**
 * The atlas's report-issue form: named on `sy-atlas-config`, read by the widget,
 * delivered to a manager the widget must never see (#813).
 *
 * Four separate rules, and each fails in a way the others cannot see:
 *
 * - the global only accepts a `contact` form, so an operator is refused at
 *   authoring time rather than a visitor at send time;
 * - the atlas client reaches `forms` by a grant rather than by the form-builder
 *   plugin's `read: () => true` default;
 * - `recipient` never leaves the server for a non-manager, at any depth;
 * - delivery still resolves that same `recipient`, because it reads with
 *   `overrideAccess: true`. A lock that also broke delivery would satisfy the
 *   case above and silently redirect every report to the system contact.
 *
 * **Fixture assumptions, each checked against the real config rather than
 * assumed.** `sahaj-atlas-client` is a client role scoped to the `sahaj-atlas`
 * project, granting `user-submissions: ['create']` and nothing else
 * (`src/plugins/access/config/roles.ts`). `forms` is in both the `sahaj-atlas`
 * and `wemeditate-web` collection lists, and `managers` is in none
 * (`src/plugins/access/config/projects.ts`). An API client read must send
 * `select` (`src/plugins/usage/hooks.ts`). Every partial write to
 * `sy-atlas-config` must carry `availableLocales`, and `['en']` alone needs no
 * relaxation (`src/fields/availableLocalesField.ts`).
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { deliverContact } from '@/jobs/DeliverSubmissions/deliverContact'
import { CONTACT_EMAIL } from '@/lib/contact'
import type { Client, Form, Manager, UserSubmission } from '@/payload-types'
import { bypassPermissions, hasPermission } from '@/plugins/access'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { sendUserMessageMock } = vi.hoisted(() => ({ sendUserMessageMock: vi.fn() }))

vi.mock('@/lib/notifications/sendUserMessage', () => ({
  sendUserMessage: sendUserMessageMock,
}))

describe('Atlas report-issue form', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let recipient: Manager
  let atlasClient: Client
  let webManager: Manager
  let contactForm: Form
  let unaddressedForm: Form
  let subscribeForm: Form

  const createForm = (data: Record<string, unknown>) =>
    payload.create({
      collection: 'forms',
      data: {
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'email', name: 'email', label: 'Email' },
          { blockType: 'textarea', name: 'message', label: 'Message' },
        ],
        ...data,
      } as never,
      overrideAccess: true,
    }) as Promise<Form>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    recipient = await testData.createManager(payload, {
      name: 'Atlas Inbox',
      email: 'atlas-inbox@example.com',
      roles: ['atlas-manager'],
    })
    webManager = await testData.createManager(payload, {
      name: 'Web Editor',
      email: 'web-editor@example.com',
      roles: ['web-translator'],
    })
    atlasClient = await testData.createClient(payload, recipient.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
      _status: 'published',
    })

    contactForm = await createForm({
      title: 'Report an issue',
      actionType: 'contact',
      recipient: recipient.id,
    })
    unaddressedForm = await createForm({ title: 'Report an issue, unaddressed', actionType: 'contact' })
    subscribeForm = await createForm({
      title: 'Newsletter',
      actionType: 'subscribe',
      client: atlasClient.id,
      fields: [{ blockType: 'email', name: 'email', label: 'Email' }],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('naming the form on sy-atlas-config', () => {
    const setForm = (formId: number) =>
      payload.updateGlobal({
        slug: 'sy-atlas-config',
        data: { availableLocales: ['en'], reportIssueForm: formId } as never,
        overrideAccess: true,
      })

    it('accepts a contact form', async () => {
      const config = await setForm(contactForm.id)
      expect(config.reportIssueForm).toMatchObject({ id: contactForm.id })
    })

    it('refuses a subscribe form', async () => {
      // `prepareUserSubmission` refuses the same mismatch with a 400, but only
      // once a visitor has written their report. `filterOptions` is what puts
      // the refusal in front of the person who can fix it.
      await expect(setForm(subscribeForm.id)).rejects.toThrow()
    })
  })

  describe('reading the form as the widget', () => {
    const readAsAtlasClient = (depth: number) =>
      payload.find({
        collection: 'forms',
        where: { id: { equals: contactForm.id } },
        select: { title: true, fields: true, recipient: true },
        depth,
        user: atlasClient,
        overrideAccess: false,
      })

    it('grants the atlas client read on forms', () => {
      expect(
        hasPermission(
          {
            user: testData.dummyUser('clients', { roles: ['sahaj-atlas-client'] }),
            collection: 'forms',
            operation: 'read',
          },
          bypassPermissions,
        ),
      ).toBe(true)
    })

    it('returns the authored fields', async () => {
      const { docs } = await readAsAtlasClient(0)
      expect(docs).toHaveLength(1)
      expect((docs[0] as Form).fields?.map((field) => field.blockType)).toEqual([
        'email',
        'textarea',
      ])
    })

    it('never returns recipient, at any depth', async () => {
      // `select` names `recipient` on purpose, and the fixture form has one.
      // Omitting either would pass for a reason unrelated to the lock.
      for (const depth of [0, 1, 2]) {
        const { docs } = await readAsAtlasClient(depth)
        expect(docs[0], `depth ${depth}`).not.toHaveProperty('recipient')
      }
    })

    it('still returns recipient to a wemeditate-web manager', async () => {
      const { docs } = await payload.find({
        collection: 'forms',
        where: { id: { equals: contactForm.id } },
        depth: 1,
        user: { ...webManager, collection: 'managers' },
        overrideAccess: false,
      })
      expect((docs[0] as Form).recipient).toMatchObject({ id: recipient.id })
    })
  })

  describe('delivering a report', () => {
    const deliver = async (form: Form) => {
      sendUserMessageMock.mockClear()
      sendUserMessageMock.mockResolvedValue(undefined)

      const submission = (await payload.create({
        collection: 'user-submissions',
        data: {
          type: 'contact',
          form: form.id,
          client: atlasClient.id,
          senderEmail: 'visitor@example.com',
          subject: 'Issue report',
          submissionData: [{ field: 'message', value: 'The map is wrong.' }],
        } as never,
        overrideAccess: true,
      })) as UserSubmission

      const outcome = await deliverContact({
        req: { payload } as unknown as PayloadRequest,
        submission,
      })
      return { outcome, to: sendUserMessageMock.mock.calls[0]?.[0]?.to as string | undefined }
    }

    it("reaches the form's recipient", async () => {
      const { outcome, to } = await deliver(contactForm)
      expect(outcome).toMatchObject({ ok: true })
      expect(to).toBe(recipient.email)
    })

    it('falls back to the system contact when the form names nobody', async () => {
      const { outcome, to } = await deliver(unaddressedForm)
      expect(outcome).toMatchObject({ ok: true })
      expect(to).toBe(CONTACT_EMAIL)
    })
  })
})
