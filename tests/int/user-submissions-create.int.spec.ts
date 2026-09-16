/**
 * The unified intake's create path (#723), per type, as an API client actually
 * performs it: write-guard plugin → `prepareUserSubmission` → field access →
 * the per-type `form` validator.
 *
 * These run with **`overrideAccess: false`** and a real published client, which
 * is the point: `overrideAccess: true` skips field-level access, so a spec using
 * it could not tell a stripped system field from an accepted one.
 *
 * The one external dependency is stubbed: the Turnstile siteverify call.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Client, Form, Manager, UserSubmission } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

const VALID_TURNSTILE = { 'x-turnstile-token': 'tok-valid' }

describe('User submissions intake (POST /api/user-submissions)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client
  let otherClient: Client
  let contactForm: Form
  let subscribeForm: Form

  /** A `req` carrying the real published client doc, so access runs for real. */
  const clientReq = (
    as: () => Client,
    headers: Record<string, string> = VALID_TURNSTILE,
  ): PayloadRequest =>
    ({
      payload,
      headers: new Headers(headers),
      user: { ...as(), collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  /**
   * A published event a client may actually read. `testData.createEvent` leaves
   * `_status` to Payload, so its events are drafts — invisible to a client, and
   * since #797 that means `gateRegistration` answers 404 rather than letting the
   * registration through.
   */
  const publishedEvent = async () => {
    const event = await testData.createEvent(payload, { manager: manager.id })
    return payload.update({
      collection: 'events',
      id: event.id,
      data: { _status: 'published' },
      context: { skipVerifyHook: true },
      overrideAccess: true,
    })
  }

  const send = (
    data: Record<string, unknown>,
    options: { as?: () => Client; headers?: Record<string, string> } = {},
  ) =>
    payload.create({
      collection: 'user-submissions',
      data: data as never,
      overrideAccess: false,
      req: clientReq(options.as ?? (() => client), options.headers ?? VALID_TURNSTILE),
    }) as Promise<UserSubmission>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    manager = await testData.createManager(payload, {
      name: 'Submissions Admin',
      email: 'submissions-admin@example.com',
    })
    client = await testData.createClient(payload, manager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    otherClient = await testData.createClient(payload, manager.id, {
      name: 'Another Service',
      roles: ['sahaj-atlas-client'],
    })

    contactForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Report an issue',
        actionType: 'contact',
        recipient: manager.id,
        // The plugin's `confirmationMessage` is required under the default
        // `message` confirmation type; a redirect sidesteps building Lexical.
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'email', name: 'email', label: 'Email' },
          { blockType: 'textarea', name: 'message', label: 'Message' },
        ],
      } as never,
      overrideAccess: true,
    })) as Form

    subscribeForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Newsletter',
        actionType: 'subscribe',
        client: client.id,
        // The plugin's `confirmationMessage` is required under the default
        // `message` confirmation type; a redirect sidesteps building Lexical.
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [{ blockType: 'email', name: 'email', label: 'Email' }],
      } as never,
      overrideAccess: true,
    })) as Form
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    // Token-aware, deliberately. A mock that succeeds for any argument makes
    // the "no token" case pass for the wrong reason — it did, until this spec
    // caught it.
    verifyMock
      .mockReset()
      .mockImplementation((token: string) =>
        Promise.resolve(
          token === 'tok-valid' ? { success: true } : { success: false, reason: 'rejected', errorCodes: [] },
        ),
      )
  })

  describe('per-type creates', () => {
    it('accepts a contact submission and returns its uuid', async () => {
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'Reporter@Example.com',
        submissionData: [
          { field: 'message', value: 'The venue for this class closed last month.' },
          { field: 'name', value: 'Ada Reporter' },
        ],
      })

      expect(doc.type).toBe('contact')
      expect(doc.status).toBe('pending')
      expect(doc.uuid).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
      // Normalized, because `users` is keyed on the lowercased address and a
      // sender's history has to be one history.
      expect(doc.senderEmail).toBe('reporter@example.com')
      // Composed, not submitted: the form's title leads.
      expect(doc.subject).toContain('Report an issue')
    })

    it('accepts a subscribe submission against its own client’s form', async () => {
      const doc = await send({
        type: 'subscribe',
        form: subscribeForm.id,
        senderEmail: 'subscriber@example.com',
      })

      expect(doc.type).toBe('subscribe')
      expect(doc.status).toBe('pending')
      expect(doc.subject).toBe('subscriber@example.com')
    })

    it('accepts a registration submission, with an event and no form', async () => {
      const event = await publishedEvent()
      const doc = await send({
        type: 'registration',
        event: event.id,
        senderEmail: 'registrant@example.com',
        startingAt: new Date('2026-10-01T18:00:00.000Z').toISOString(),
        submissionData: [{ field: 'experience', value: 'None yet' }],
      })

      expect(doc.type).toBe('registration')
      expect(doc.uuid).toBeTruthy()
      expect(doc.form).toBeFalsy()
    })

    it('gates the proposed patch against the live Events config', async () => {
      // `proposed` is applied to an Event by Phase 3's accept path, so an
      // ungated public POST is a write to Events with a manager's authority
      // behind it. Reuses `event-submissions`' own gate.
      await expect(
        send({
          type: 'proposal',
          senderEmail: 'forger@example.com',
          proposed: { title: 'Legit', verificationStage: 'verified' },
        }),
      ).rejects.toThrow(/verificationStage/)
    })

    it('accepts a proposal submission, with neither a form nor an event', async () => {
      // ⚠ This is why `event` carries no `required`, under any condition
      // (#791 review): a proposal for a brand-new event has no target to name,
      // and that is the whole point of the type. The subject says so too.
      const doc = await send({
        type: 'proposal',
        senderEmail: 'proposer@example.com',
        proposed: { title: 'A new class in Leeds' },
        submissionData: [{ field: 'note', value: 'We meet every Tuesday.' }],
      })

      expect(doc.type).toBe('proposal')
      expect(doc.event).toBeFalsy()
      expect(doc.subject).toBe('New event proposal')
    })
  })

  describe('the four-state status vocabulary', () => {
    it('starts every type at pending', async () => {
      // One vocabulary for four types is what lets a single screening job, a
      // single delivery queue and a single purge sweep exist at all.
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'status@example.com',
        submissionData: [{ field: 'message', value: 'Checking the status field.' }],
      })
      expect(doc.status).toBe('pending')
    })

    it('refuses a client-forged terminal status', async () => {
      // Field access strips it rather than throwing, so assert the stored
      // value — a spec asserting "does not throw" would pass either way.
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        status: 'accepted',
        senderEmail: 'forger@example.com',
        submissionData: [{ field: 'message', value: 'Trying to skip screening.' }],
      })
      expect(doc.status).toBe('pending')
    })

    it('refuses a status outside the vocabulary', async () => {
      await expect(
        payload.create({
          collection: 'user-submissions',
          data: {
            type: 'contact',
            form: contactForm.id,
            status: 'delivered',
            senderEmail: 'admin@example.com',
          } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  describe('submissionData bounds', () => {
    it('refuses an unknown key, naming it', async () => {
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'sneaky@example.com',
          submissionData: [{ field: 'isAdmin', value: 'true' }],
        }),
      ).rejects.toThrow(/isAdmin/)
    })

    it("accepts a key the form's author declared", async () => {
      const form = (await payload.create({
        collection: 'forms',
        data: {
          title: 'Long contact form',
          actionType: 'contact',
          // The plugin's `confirmationMessage` is required under the default
        // `message` confirmation type; a redirect sidesteps building Lexical.
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
          fields: [
            { blockType: 'email', name: 'email', label: 'Email' },
            { blockType: 'textarea', name: 'message', label: 'Message' },
            { blockType: 'text', name: 'howDidYouHear', label: 'How did you hear?' },
          ],
        } as never,
        overrideAccess: true,
      })) as Form

      const doc = await send({
        type: 'contact',
        form: form.id,
        senderEmail: 'authored@example.com',
        submissionData: [
          { field: 'message', value: 'Hello.' },
          { field: 'howDidYouHear', value: 'A friend' },
        ],
      })
      expect(doc.id).toBeTruthy()
    })

    it('refuses a registration answer on a contact row', async () => {
      // The per-type split, at the boundary: `experience` is a real key, but
      // not one a contact form collects.
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'crossed@example.com',
          submissionData: [{ field: 'experience', value: 'None yet' }],
        }),
      ).rejects.toThrow(/experience/)
    })

    it('refuses an over-long value', async () => {
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'verbose@example.com',
          submissionData: [{ field: 'message', value: 'x'.repeat(5001) }],
        }),
      ).rejects.toThrow()
    })

    it('scans the pairs for URLs but exempts the crash-report context', async () => {
      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'spammer@example.com',
          submissionData: [{ field: 'message', value: 'Buy now at https://spam.example' }],
        }),
      ).rejects.toThrow()

      // The other half of the same rule, and the reason it is not a
      // `urlScanFields` entry: an issue report names the page it happened on.
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'reporter2@example.com',
        submissionData: [
          { field: 'message', value: 'The map does not load.' },
          { field: 'hostUrl', value: 'https://example.com/meditation' },
          { field: 'error', value: 'TypeError at https://example.com/assets/embed.js' },
        ],
      })
      expect(doc.id).toBeTruthy()
    })
  })

  /**
   * ⚠ Every case here runs through the **API** path, and that is the point.
   * The requirement is `required` plus `admin.condition` since the #791 review,
   * and a condition is widely assumed to be an admin-UI affordance — so these
   * assert the rule where an API client meets it, not where a form renders.
   * (Payload evaluates the condition server-side and skips `required` with it:
   * `payload/dist/fields/hooks/beforeChange/promise.js`.)
   */
  describe('the per-type form requirement', () => {
    /**
     * The per-field messages a Payload `ValidationError` **buries**: its own
     * `message` is composed from the field labels alone ("The following field
     * is invalid: Form"), so `rejects.toThrow(/…/)` can only ever match a
     * label. Reading `data.errors` is what tells "refused by this field, for
     * this reason" apart from "refused by the write guard, three steps
     * earlier" — every case below throws something.
     */
    const refusalFor = async (promise: Promise<unknown>): Promise<string[]> => {
      try {
        await promise
      } catch (error) {
        const { errors } =
          (error as { data?: { errors?: { message?: string; path?: string }[] } }).data ?? {}
        return (errors ?? []).map(({ message, path }) => `${path}: ${message}`)
      }
      throw new Error('Expected the submission to be refused; it was accepted.')
    }

    it('refuses a contact submission with no form', async () => {
      expect(
        await refusalFor(
          send({
            type: 'contact',
            senderEmail: 'formless@example.com',
            submissionData: [{ field: 'message', value: 'No form named.' }],
          }),
        ),
      ).toEqual(['form: This field is required.'])
    })

    it('refuses a subscribe submission with neither a form nor an event', async () => {
      // The exemption below is what a formless subscribe row rests on. With no
      // event there is nothing to resolve a target list from, so `required`
      // applies exactly as it does to a contact.
      expect(
        await refusalFor(
          send({
            type: 'subscribe',
            senderEmail: 'unreachable@example.com',
          }),
        ),
      ).toEqual(['form: This field is required.'])
    })

    it('accepts a formless subscribe row that carries an event', async () => {
      // The exemption a registration opt-in relies on: the spawned consent row
      // has no form of its own, and its `event` is both the link back to the
      // registration and what resolves the target list at delivery
      // (`hooks/spawnSubscribeFromRegistration.ts`). Asserted here as well as
      // through the spawn path, because the spawn is what would break if the
      // condition gating `required` lost this clause.
      const event = await testData.createEvent(payload, { manager: manager.id })
      const doc = await send({
        type: 'subscribe',
        event: event.id,
        senderEmail: 'opted-in@example.com',
      })

      expect(doc.type).toBe('subscribe')
      expect(doc.form).toBeFalsy()
    })

    it('refuses a registration that names a form', async () => {
      // The half no condition can carry: a false condition skips validation
      // rather than refusing a value, so this rule lives on `event`'s own
      // validator, whose condition is true for exactly the types it covers.
      const event = await publishedEvent()
      expect(
        await refusalFor(
          send({
            type: 'registration',
            event: event.id,
            form: contactForm.id,
            senderEmail: 'confused@example.com',
          }),
        ),
      ).toEqual(['event: A registration submission names an event, not a form.'])
    })

    it('refuses a proposal that names a form, and carries no event at all', async () => {
      // The same prohibition on the type that may have no event either — so it
      // is refused for naming a form, not for want of an event.
      expect(
        await refusalFor(
          send({
            type: 'proposal',
            form: contactForm.id,
            senderEmail: 'misfiled@example.com',
            proposed: { title: 'Filed against a form' },
          }),
        ),
      ).toEqual(['event: A proposal submission names an event, not a form.'])
    })

    it("keeps the plugin's own existence check", async () => {
      // Composed with, not replaced: dropping it would let a submission name a
      // form id that never existed.
      await expect(
        send({
          type: 'contact',
          form: 999_999,
          senderEmail: 'ghost@example.com',
          submissionData: [{ field: 'message', value: 'Pointing at nothing.' }],
        }),
      ).rejects.toThrow()
    })
  })

  describe('system fields', () => {
    it('stamps the client from the authenticated key, not the body', async () => {
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        client: otherClient.id,
        senderEmail: 'attributed@example.com',
        submissionData: [{ field: 'message', value: 'Whose message is this?' }],
      })
      // `payload.create` returns relationships populated, so compare ids.
      expect(typeof doc.client === 'object' ? doc.client?.id : doc.client).toBe(client.id)
    })

    it('upserts one users row across types for one sender', async () => {
      // The whole reason for one table: a sender hitting two intakes is one
      // history, which no per-collection design can express.
      const email = 'repeat@example.com'
      const first = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: email,
        submissionData: [{ field: 'message', value: 'First contact.' }],
      })
      const second = await send({
        type: 'proposal',
        senderEmail: email,
        proposed: { title: 'And a proposal' },
      })

      const userId = (doc: UserSubmission) =>
        typeof doc.user === 'object' ? doc.user?.id : doc.user
      expect(userId(first)).toBeTruthy()
      expect(userId(second)).toBe(userId(first))
    })

    it('refuses a client-chosen uuid', async () => {
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        uuid: 'chosen-by-the-caller',
        senderEmail: 'minter@example.com',
        submissionData: [{ field: 'message', value: 'Minting my own identifier.' }],
      })
      expect(doc.uuid).not.toBe('chosen-by-the-caller')
    })
  })

  describe('the type discriminator', () => {
    it('refuses an unrecognised type with a 400, not a 500', async () => {
      // The hook runs before Payload validates the select's options, so an
      // unchecked cast reached `TYPE_SUBMISSION_KEYS[type]` and spread
      // `undefined` — a TypeError, surfaced as `Something went wrong.` and
      // paging Sentry once per attempt.
      await expect(send({ type: 'bogus', senderEmail: 'a@example.com' })).rejects.toThrow(/bogus/)
    })

    it("refuses a type that disagrees with the form's actionType", async () => {
      // The form is the authority on what a submission against it is. A caller
      // and a form disagreeing is a bug in the caller, and every per-type rule
      // downstream keys on `type`.
      await expect(
        send({
          type: 'contact',
          form: subscribeForm.id,
          senderEmail: 'mislabelled@example.com',
          submissionData: [{ field: 'message', value: 'Calling this a contact.' }],
        }),
      ).rejects.toThrow(/subscribe/)
    })

    /**
     * A client may name **another** service's subscribe form, deliberately
     * (#791 review). A registration opt-in already spawns a subscribe row for
     * whichever service runs the class, so cross-service subscription is
     * reachable regardless, and a gate on the direct path would only make the
     * two routes disagree. Asserted rather than left unpinned, so re-adding
     * the gate is a red test rather than a silent narrowing.
     */
    it('accepts a subscribe row naming another service’s form', async () => {
      const foreignForm = (await payload.create({
        collection: 'forms',
        data: {
          title: 'Another service’s newsletter',
          actionType: 'subscribe',
          client: otherClient.id,
          confirmationType: 'redirect',
          redirect: { url: '/thanks' },
          fields: [{ blockType: 'email', name: 'email', label: 'Email' }],
        } as never,
        overrideAccess: true,
      })) as Form

      const doc = await send({
        type: 'subscribe',
        form: foreignForm.id,
        senderEmail: 'poached@example.com',
      })

      expect(doc.type).toBe('subscribe')
      expect(typeof doc.form === 'object' ? doc.form?.id : doc.form).toBe(foreignForm.id)
    })

    it('is immutable once the row exists', async () => {
      // Every access rule and retention window keys on `type`, and a manager
      // holds update. `admin.readOnly` is the admin UI only.
      //
      // The manager has to be one the row is actually reachable by, or the
      // per-row scope refuses the update first and this proves nothing about
      // the field. So: an atlas-manager who is the form's own recipient.
      const meddler = await testData.createManager(payload, {
        name: 'Meddling Manager',
        email: 'meddler@example.com',
        roles: ['atlas-manager'],
      })

      const ownForm = (await payload.create({
        collection: 'forms',
        data: {
          title: 'Addressed to the meddler',
          actionType: 'contact',
          recipient: meddler.id,
          confirmationType: 'redirect',
          redirect: { url: '/thanks' },
          fields: [
            { blockType: 'email', name: 'email', label: 'Email' },
            { blockType: 'textarea', name: 'message', label: 'Message' },
          ],
        } as never,
        overrideAccess: true,
      })) as Form

      const doc = await send({
        type: 'contact',
        form: ownForm.id,
        senderEmail: 'immutable@example.com',
        submissionData: [{ field: 'message', value: 'Should stay a contact.' }],
      })

      const after = (await payload.update({
        collection: 'user-submissions',
        id: doc.id,
        data: { type: 'proposal' } as never,
        overrideAccess: false,
        req: {
          payload,
          headers: new Headers(),
          user: { ...meddler, collection: 'managers' },
          locale: 'en',
          context: {},
        } as unknown as PayloadRequest,
      })) as UserSubmission
      // The write went through (so the scope did let them in) and `type` is
      // unchanged — which is the property under test.
      expect(after.senderEmail).toBe('immutable@example.com')
      expect(after.type).toBe('contact')
    })
  })

  describe('the audit trail', () => {
    it('refuses a client-forged activityLog', async () => {
      // `logField` promised in prose that it is never API-writable, and said so
      // nowhere the server reads. `activityLog` renders in the admin as
      // system-written history, so a forged delivery record would read as fact.
      const doc = await send({
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'forger2@example.com',
        submissionData: [{ field: 'message', value: 'Forging a history.' }],
        activityLog: [
          {
            at: '2026-01-01T00:00:00.000Z',
            type: 'delivery',
            cells: { activity: 'Delivered — screening passed' },
          },
        ],
      })
      expect(doc.activityLog ?? []).toHaveLength(0)
    })
  })

  describe('subject composition', () => {
    it('does not echo the title of an unpublished event', async () => {
      // `event` is client-writable, and `titleOf` elevates — so without the
      // published check a create-only client could name any event id and read
      // its title back out of `subject`, one row at a time, routing around the
      // published-only narrowing its own reads get.
      //
      // ⚠ Asserted on a **proposal**, not a registration. Since #797 a client
      // registration naming an event it cannot read is refused 404 outright, so
      // the registration shape no longer reaches `titleOf` at all — and a case
      // that cannot reach the code it names is not covering it. A proposal is
      // not gated, so it still is the shape that probes this.
      const draft = await testData.createEvent(payload, { manager: manager.id })
      await payload.update({
        collection: 'events',
        id: draft.id,
        data: { _status: 'draft' } as never,
        overrideAccess: true,
      })

      const doc = await send({
        type: 'proposal',
        event: draft.id,
        senderEmail: 'prober@example.com',
        proposed: { title: 'Something else' },
      })
      expect(doc.subject).not.toContain(draft.title)
    })
  })

  describe('the captcha gate', () => {
    it('refuses a create with no Turnstile token', async () => {
      await expect(
        send(
          {
            type: 'contact',
            form: contactForm.id,
            senderEmail: 'tokenless@example.com',
            submissionData: [{ field: 'message', value: 'No token at all.' }],
          },
          { headers: {} },
        ),
      ).rejects.toThrow()
    })

    it('refuses a create Cloudflare rejects', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'rejected', errorCodes: [] })

      await expect(
        send({
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'rejected@example.com',
          submissionData: [{ field: 'message', value: 'A forged token.' }],
        }),
      ).rejects.toThrow()
    })
  })

  describe('the review projections', () => {
    // ⚠ Both are `virtual` fields with an `afterRead` hook, and Payload runs
    // field `afterRead` hooks on the response of a **create** — with no
    // `findMany` argument, so their own list-read guard does not fire there.
    // `loadTargetEvent` reads the named event with `overrideAccess: true,
    // draft: true, trash: true`, and `mergeProposal` returns the whole
    // document. Without field-level `read` access denying clients, a published
    // key could POST a proposal naming any event id and read that event back
    // out of the 201 body — past the published-only filter (which applies on
    // `read` alone), past the trash filter, and past the `select` requirement.
    it('are absent from a client’s create response, even naming a draft event', async () => {
      const draft = await testData.createEvent(payload, { manager: manager.id })
      await payload.update({
        collection: 'events',
        id: draft.id,
        data: { _status: 'draft' },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })

      const created = await send({
        type: 'proposal',
        event: draft.id,
        senderEmail: 'prober@example.com',
        proposed: { title: 'Anything' },
      })

      expect(created.previewEvent).toBeUndefined()
      expect(created.proposedChanges).toBeUndefined()
    })

    it('are present for a manager, so the review page still works', async () => {
      const event = await testData.createEvent(payload, { manager: manager.id })
      const created = await payload.create({
        collection: 'user-submissions',
        data: {
          type: 'proposal',
          event: event.id,
          senderEmail: 'proposer@example.com',
          proposed: { title: 'A better title' },
        } as never,
        overrideAccess: true,
      })

      const asManager = await payload.findByID({
        collection: 'user-submissions',
        id: created.id,
        overrideAccess: true,
      })
      expect(asManager.proposedChanges).toBeTruthy()
    })
  })
})
