/**
 * `Forms.actionType` and what each action needs from the authored field list
 * (#723).
 *
 * **Save time, not submit time.** A subscribe form with no email field collects
 * nothing a subscription can be made from, and a contact form with no message
 * body collects nothing to deliver. Both fail on every submission, one visitor
 * at a time, with the author never seeing it — so the refusal has to land while
 * the person who can fix it is present.
 *
 * The `emails` cases are here rather than in the unit lane because "the field
 * does not exist" is a fact about the sanitized collection config, which only a
 * booted Payload has.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Client, Form, Manager } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const EMAIL_FIELD = { blockType: 'email', name: 'email', label: 'Email' }
const MESSAGE_FIELD = { blockType: 'textarea', name: 'message', label: 'Message' }
const STATIC_MESSAGE = { blockType: 'message' }

/**
 * A `ValidationError`'s own message is composed from field paths ("The
 * following field is invalid: fields"), and the sentence a form author reads
 * sits in `data.errors`. Asserting on it is what stops a case passing for a
 * rule other than its own — three of these did.
 */
const refusalMessages = async (save: Promise<unknown>): Promise<string> => {
  try {
    await save
  } catch (error) {
    const errors = (error as { data?: { errors?: { message?: string }[] } }).data?.errors ?? []
    return errors.map((entry) => entry.message ?? '').join(' ')
  }
  throw new Error('Expected the save to be refused, and it was not.')
}

describe('Forms action types', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client

  const createForm = (data: Record<string, unknown>) =>
    payload.create({
      collection: 'forms',
      data: {
        title: 'A form',
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        ...data,
      } as never,
      overrideAccess: true,
    }) as Promise<Form>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    manager = await testData.createManager(payload, {
      name: 'Form Author',
      email: 'form-author@example.com',
    })
    client = await testData.createClient(payload, manager.id, { name: 'Newsletter Client' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the authored field list', () => {
    it('saves a contact form with an email and a message field', async () => {
      const form = await createForm({
        actionType: 'contact',
        recipient: manager.id,
        fields: [EMAIL_FIELD, MESSAGE_FIELD],
      })
      expect(form.actionType).toBe('contact')
    })

    it('refuses a subscribe form with no email field', async () => {
      // The client is supplied, so this can only fail for the field-list rule.
      // Without it the case also broke the "subscribe needs a client" rule, and
      // deleting the email check entirely would have left it green.
      expect(
        await refusalMessages(
          createForm({ actionType: 'subscribe', client: client.id, fields: [MESSAGE_FIELD] }),
        ),
      ).toMatch(/Email field/)
    })

    it('refuses a contact form with no message field', async () => {
      expect(
        await refusalMessages(
          createForm({ actionType: 'contact', recipient: manager.id, fields: [EMAIL_FIELD] }),
        ),
      ).toMatch(/Text or Textarea/)
    })

    it('does not count the static Message block as a message field', async () => {
      // The plugin's `message` block is rich text an author writes, not an
      // input a visitor fills — so a form carrying one still collects nothing.
      await expect(
        createForm({
          actionType: 'contact',
          recipient: manager.id,
          fields: [EMAIL_FIELD, STATIC_MESSAGE],
        }),
      ).rejects.toThrow()
    })
  })

  describe('the conditional fields', () => {
    it('refuses a subscribe form with no client', async () => {
      // Per-action, so it cannot be `required: true` on the field — that would
      // demand a client of every contact form too, and make the column NOT NULL
      // on a table that already has rows.
      expect(
        await refusalMessages(createForm({ actionType: 'subscribe', fields: [EMAIL_FIELD] })),
      ).toMatch(/needs a client/)
    })

    it('saves a contact form with no recipient', async () => {
      // Null on purpose: a null recipient falls back to CONTACT_EMAIL, which is
      // how the widget's report-issue path — which has no form at all — keeps
      // working. The two must agree.
      const form = await createForm({
        actionType: 'contact',
        fields: [EMAIL_FIELD, MESSAGE_FIELD],
      })
      expect(form.recipient).toBeFalsy()
    })
  })

  describe('updates', () => {
    it('refuses a save that clears a subscribe form’s client', async () => {
      // The trap this covers: Payload normalises a cleared relationship to
      // `null`, and only an *absent* field is back-filled from the stored doc —
      // so a `??` merge reads the clearing as the old value and the one rule
      // this hook exists for passes on the single save that breaks it.
      const form = await createForm({
        actionType: 'subscribe',
        client: client.id,
        fields: [EMAIL_FIELD],
      })

      expect(
        await refusalMessages(
          payload.update({
            collection: 'forms',
            id: form.id,
            data: { client: null } as never,
            overrideAccess: true,
          }),
        ),
      ).toMatch(/needs a client/)
    })

    it('lets an unrelated edit through on a form the rule would refuse', async () => {
      // Every form that predates `actionType` back-fills to `contact` through
      // the column default, and a legacy one may hold no message field. If the
      // rule ran on every save, a coordinator renaming such a form would meet a
      // refusal about a field list they never touched — and the row would be
      // unsaveable in the admin forever.
      const legacy = (await payload.create({
        collection: 'forms',
        data: {
          title: 'Legacy form',
          confirmationType: 'redirect',
          redirect: { url: '/thanks' },
          fields: [EMAIL_FIELD, MESSAGE_FIELD],
        } as never,
        overrideAccess: true,
      })) as Form

      // Put it in the state a back-filled legacy row lands in: contact, with no
      // message field. Written through the DB layer so the guard cannot object.
      await payload.db.updateOne({
        collection: 'forms',
        where: { id: { equals: legacy.id } },
        data: { fields: [{ ...EMAIL_FIELD, id: 'legacy-email' }] },
      })

      const renamed = (await payload.update({
        collection: 'forms',
        id: legacy.id,
        data: { title: 'Legacy form, renamed' } as never,
        overrideAccess: true,
      })) as Form

      expect(renamed.title).toBe('Legacy form, renamed')
    })

    it('still refuses a save that edits the field list into an invalid state', async () => {
      // The other half: the rule fires whenever the patch touches what it
      // governs, so narrowing it above did not disarm it.
      const form = await createForm({
        actionType: 'contact',
        recipient: manager.id,
        fields: [EMAIL_FIELD, MESSAGE_FIELD],
      })

      expect(
        await refusalMessages(
          payload.update({
            collection: 'forms',
            id: form.id,
            data: { fields: [EMAIL_FIELD] } as never,
            overrideAccess: true,
          }),
        ),
      ).toMatch(/Text or Textarea/)
    })
  })

  describe('the plugin email feature', () => {
    it('has no `emails` field on the collection at all', () => {
      // Structural, not suppressed: with the field gone nothing can be
      // authored, so the plugin's create-time `sendEmail` has nothing to send
      // and no `beforeEmail` hook silently swallows anybody's message.
      const fields = payload.collections.forms?.config.flattenedFields ?? []
      expect(fields.some((field) => 'name' in field && field.name === 'emails')).toBe(false)
      // Contrast, so this cannot pass on an empty field list.
      expect(fields.some((field) => 'name' in field && field.name === 'actionType')).toBe(true)
    })
  })
})
