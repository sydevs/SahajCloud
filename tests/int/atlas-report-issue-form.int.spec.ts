/**
 * The atlas's report-issue form: named on `sy-atlas-config`, read by the widget,
 * delivered to a manager the widget must never see (#813).
 *
 * The `recipient` lock and the delivery cases are two halves of one rule, and a
 * spec carrying only the first would pass while every report silently went to
 * `CONTACT_EMAIL` instead of the named manager — `recipientFor` reads with
 * `overrideAccess: true` precisely so the lock does not reach it.
 *
 * Two fixture facts the spec body does not show: an API client read must send
 * `select` (`src/plugins/usage/hooks.ts`), and every partial write to
 * `sy-atlas-config` must carry `availableLocales`
 * (`src/fields/availableLocalesField.ts`).
 *
 * The permission matrix itself lives in `role-based-access.int.spec.ts`, which
 * pins the `forms` grant for all three client roles.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { deliverContact } from '@/jobs/DeliverSubmissions/deliverContact'
import { CONTACT_EMAIL } from '@/lib/contact'
import type { Client, Form, Manager, UserSubmission } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { sendUserMessageMock, verifyMock } = vi.hoisted(() => ({
  sendUserMessageMock: vi.fn(),
  verifyMock: vi.fn(async () => ({ success: true as const })),
}))

vi.mock('@/lib/notifications/sendUserMessage', () => ({
  sendUserMessage: sendUserMessageMock,
}))
vi.mock('@/lib/turnstile/verifyTurnstile', () => ({ verifyTurnstileToken: verifyMock }))

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
      roles: [],
    })
    webManager = await testData.createManager(payload, {
      name: 'Web Editor',
      email: 'web-editor@example.com',
      roles: ['web-translator'],
    })
    atlasClient = await testData.createClient(payload, recipient.id, {
      label: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
      enabled: true,
    })

    contactForm = await createForm({
      title: 'Report an issue',
      actionType: 'contact',
      recipient: recipient.id,
    })
    unaddressedForm = await createForm({
      title: 'Report an issue, unaddressed',
      actionType: 'contact',
    })
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
      for (const depth of [0, 1]) {
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
      // A bare id, not a populated manager: `web-translator` holds no
      // `managers` grant since #821 restricted the collection — the accepted
      // cost recorded in `docs/rules/access.md`. The id is what tells the lock
      // passing the field through apart from the lock stripping it.
      expect((docs[0] as Form).recipient).toBe(recipient.id)
    })

    it('never returns client, at any depth', async () => {
      // The subscribe form, because it is the one that names a client. A
      // populated `clients` document carries the plaintext `apiKey` (#822), so
      // this lock is worth more than `recipient`'s, not less.
      for (const depth of [0, 1]) {
        const { docs } = await payload.find({
          collection: 'forms',
          where: { id: { equals: subscribeForm.id } },
          select: { title: true, client: true },
          depth,
          user: atlasClient,
          overrideAccess: false,
        })
        expect(docs[0], `depth ${depth}`).not.toHaveProperty('client')
      }
    })
  })

  // Every report the widget sent was refused as `System > Form` invalid: the
  // form-builder plugin proves the form exists with a `findByID` on the caller's
  // req and no `select`, which the client read gate refuses. The other cases
  // here create with `overrideAccess` and no user, so none of them took that path.
  describe('submitting a report as the widget', () => {
    const answers = [
      { field: 'email', value: 'visitor@example.org' },
      { field: 'message', value: 'The class has moved to the hall next door.' },
    ]

    const report = (formId: number, submissionData = answers) =>
      payload.create({
        collection: 'user-submissions',
        data: {
          type: 'contact',
          form: formId,
          senderEmail: 'visitor@example.org',
          submissionData,
        } as never,
        overrideAccess: false,
        req: {
          payload,
          headers: new Headers({ 'x-turnstile-token': 'tok-valid' }),
          user: { ...atlasClient, collection: 'clients' },
          context: {},
        } as unknown as PayloadRequest,
      }) as Promise<UserSubmission>

    it('accepts a report naming the configured form', async () => {
      const submission = await report(contactForm.id)

      expect(submission.id).toBeDefined()
      expect(submission.type).toBe('contact')
    })

    it('still refuses a form id that does not exist', async () => {
      // The thrown message is the wrapper (`System > Form`), which is also what
      // the defect above produced — so the field's own message is the assertion.
      // No answers: an unknown form names no fields, so any answer is refused first.
      let messages: string[] = []
      try {
        await report(999_999, [])
      } catch (error) {
        const { errors } = (error as { data?: { errors?: { message?: string }[] } }).data ?? {}
        messages = (errors ?? []).map((entry) => entry.message ?? '')
      }

      expect(messages).toEqual([expect.stringContaining('this form does not exist')])
    })
  })

  describe('delivering a report', () => {
    const deliver = async (
      form: Form,
      submissionData: { field: string; value: string }[] = [
        { field: 'message', value: 'The map is wrong.' },
      ],
    ) => {
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
          submissionData,
        } as never,
        overrideAccess: true,
      })) as UserSubmission

      const outcome = await deliverContact({
        req: { payload } as unknown as PayloadRequest,
        submission,
      })
      const args = sendUserMessageMock.mock.calls[0]?.[0] as
        { to?: string; answers?: { label: string; value: string }[] } | undefined
      return { outcome, to: args?.to, answers: args?.answers }
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

    it('delivers every authored answer, whatever its field is named', async () => {
      // The defect: delivery read the single key `message`, so an author who
      // named their textarea anything else sent an email with no body while
      // the visitor was shown a thank-you screen. Nothing pinned that name.
      const renamed = await createForm({
        title: 'Report an issue, renamed',
        actionType: 'contact',
        recipient: recipient.id,
        fields: [
          { blockType: 'email', name: 'email', label: 'Your email' },
          { blockType: 'textarea', name: 'details', label: 'What went wrong?' },
          {
            blockType: 'select',
            name: 'topic',
            label: 'Topic',
            options: [
              { label: 'Wrong address', value: 'address' },
              { label: 'Class has moved', value: 'moved' },
            ],
          },
          { blockType: 'checkbox', name: 'consent', label: 'Contact me' },
        ],
      })

      const { outcome, answers } = await deliver(renamed, [
        { field: 'email', value: 'visitor@example.com' },
        { field: 'details', value: 'The pin is in the sea.' },
        { field: 'topic', value: 'moved' },
        { field: 'consent', value: 'false' },
      ])

      expect(outcome).toMatchObject({ ok: true })
      expect(answers).toEqual([
        { label: 'Your email', value: 'visitor@example.com' },
        { label: 'What went wrong?', value: 'The pin is in the sea.' },
        // The stored answer is the option's `value`; the recipient reads its label.
        { label: 'Topic', value: 'Class has moved' },
        // An unticked consent box is an answer, so it renders rather than vanishing.
        { label: 'Contact me', value: 'No' },
      ])
    })

    it('reads the labels in the submission’s own locale', async () => {
      // The forms plugin localizes `label`, so the delivery read chooses which
      // language the manager reads the question in. Nothing in this repo
      // declares that — only the schema shows it
      // (`forms_blocks_textarea_locales.label`).
      const localized = await createForm({
        title: 'Report an issue, localized',
        actionType: 'contact',
        recipient: recipient.id,
        fields: [
          { blockType: 'email', name: 'email', label: 'Email' },
          { blockType: 'textarea', name: 'details', label: 'What went wrong?' },
        ],
      })

      // ⚠ The blocks array itself is not localized — only `label` inside it is.
      // So the German save has to carry each block's own `id`, or Payload reads
      // the list as a replacement and drops the English labels with the rows.
      const germanLabels: Record<string, string> = {
        email: 'E-Mail',
        details: 'Was ist schiefgelaufen?',
      }
      await payload.update({
        collection: 'forms',
        id: localized.id,
        locale: 'de',
        data: {
          fields: (localized.fields ?? []).map((block) => ({
            ...block,
            label: germanLabels[(block as { name: string }).name],
          })),
        } as never,
        overrideAccess: true,
      })

      const { answers } = await deliver(localized, [
        { field: 'locale', value: 'de' },
        { field: 'details', value: 'Die Nadel liegt im Meer.' },
      ])

      expect(answers).toEqual([
        { label: 'Was ist schiefgelaufen?', value: 'Die Nadel liegt im Meer.' },
      ])
    })

    it('falls back to the default locale for a locale the CMS does not have', async () => {
      // `locale` is submitter-chosen text, exempt from the URL scan, and it
      // reaches the database layer as a query parameter — so it is gated rather
      // than forwarded.
      const { outcome, answers } = await deliver(contactForm, [
        { field: 'locale', value: 'not-a-locale' },
        { field: 'message', value: 'The map is wrong.' },
      ])

      expect(outcome).toMatchObject({ ok: true })
      expect(answers).toEqual([{ label: 'Message', value: 'The map is wrong.' }])
    })
  })
})
