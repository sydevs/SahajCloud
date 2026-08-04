/**
 * `jsonSchema` write enforcement (#597).
 *
 * Several `type: 'json'` fields carry a JSON Schema derived from their source of
 * truth, which Payload feeds to Ajv on write and to the TypeScript generator.
 * The generated types are checked by `pnpm typecheck` — what nothing else
 * proves is that the schema actually *reaches* Ajv through Payload's config
 * sanitization, so a malformed write is a 400 rather than a silently-stored blob.
 *
 * One case per newly-schema'd field. Fields covered elsewhere:
 * `Videos.subtitles` (videos.int.spec.ts), the translations groups
 * (translations-globals.int.spec.ts), `Registrations.questions`
 * (event-registration.int.spec.ts, #595).
 */
import type { Payload, ValidationError } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Event, Manager, Registration } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('jsonSchema write enforcement', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  /** Run a write expected to fail, and return its status + joined field messages. */
  async function rejected(write: () => Promise<unknown>) {
    try {
      await write()
    } catch (error) {
      const { data, status } = error as ValidationError
      return { messages: data.errors.map((e) => e.message).join(' '), status }
    }
    throw new Error('Expected the write to be rejected')
  }

  describe('Managers.notificationPreferences', () => {
    // Every case here writes a value the generated type rightly rejects — that
    // *is* the test — so each cast is deliberate, and narrow to the one field.
    const createManager = (notificationPreferences: unknown) =>
      testData.createManager(payload, {
        notificationPreferences: notificationPreferences as Manager['notificationPreferences'],
      })

    it('rejects a frequency outside the type’s own options', async () => {
      const { messages, status } = await rejected(() =>
        // "Never" is not among event_verification's cadences.
        createManager({ event_verification: { frequency: 'Never', method: 'email' } }),
      )

      expect(status).toBe(400)
      expect(messages).toMatch(/frequency.*must be equal to one of the allowed values/)
    })

    it('rejects a notification type that isn’t configured', async () => {
      const { status } = await rejected(() =>
        createManager({ not_a_notification_type: { frequency: 'Immediate', method: 'email' } }),
      )

      expect(status).toBe(400)
    })

    it('still applies the cross-field rule the schema can’t express', async () => {
      // Schema-valid (both keys present, frequency in range) but a non-Never
      // cadence with no delivery method — only the pure-JS validate catches it,
      // and only if it runs *after* delegating to the built-in json validation.
      const { messages, status } = await rejected(() =>
        createManager({ event_registration: { frequency: 'Immediate', method: '' } }),
      )

      expect(status).toBe(400)
      expect(messages).toMatch(/Select a notification method for: Event Registration/)
    })

    it('accepts the shape the field’s own defaultValue produces', async () => {
      const manager = await testData.createManager(payload)

      expect(manager.notificationPreferences).toMatchObject({
        event_verification: { frequency: 'Monthly', method: 'email' },
      })
    })
  })

  describe('Events.notificationLog', () => {
    it('rejects a reminder entry missing its escalation level', async () => {
      const event = await testData.createEvent(payload)
      const { messages, status } = await rejected(() =>
        payload.update({
          collection: 'events',
          id: event.id,
          overrideAccess: true,
          context: { skipVerifyHook: true },
          data: {
            // No `level` — the entry the builders always fill in.
            notificationLog: [
              {
                kind: 'reminder',
                stage: 'reminded',
                role: 'manager',
                at: new Date().toISOString(),
                manager: { id: 1, name: 'Someone' },
                channel: 'email',
                destination: 'someone@example.com',
              },
            ] as unknown as Event['notificationLog'],
          },
        }),
      )

      expect(status).toBe(400)
      expect(messages).toMatch(/level/)
    })

    it('accepts an entry in the shape the builders produce', async () => {
      const event = await testData.createEvent(payload)
      const at = new Date().toISOString()
      const updated = await payload.update({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        context: { skipVerifyHook: true },
        data: {
          notificationLog: [{ kind: 'verification', at, by: null, method: 'import' }],
        },
      })

      expect(updated.notificationLog).toEqual([
        { kind: 'verification', at, by: null, method: 'import' },
      ])
    })
  })

  describe('Registrations.reminderLog', () => {
    async function createRegistration(reminderLog: unknown) {
      const event = await testData.createEvent(payload)
      const user = await payload.create({
        collection: 'users',
        overrideAccess: true,
        data: createData<'users'>({
          email: `ledger-${Math.random().toString(36).slice(2)}@example.com`,
          name: 'Ledger Tester',
        }),
      })
      return payload.create({
        collection: 'registrations',
        overrideAccess: true,
        data: createData<'registrations'>({
          event: event.id,
          user: user.id,
          uuid: `uuid-${Math.random().toString(36).slice(2)}`,
          reminderLog: reminderLog as Registration['reminderLog'],
        }),
      })
    }

    it('rejects a ledger entry missing its sentAt stamp', async () => {
      const { messages, status } = await rejected(() =>
        createRegistration([{ occurrence: '2026-09-01T09:00:00.000Z' }]),
      )

      expect(status).toBe(400)
      expect(messages).toMatch(/sentAt/)
    })

    it('accepts an entry in the shape the reminder job appends', async () => {
      const entry = { occurrence: '2026-09-01T09:00:00.000Z', sentAt: new Date().toISOString() }
      const registration = await createRegistration([entry])

      expect(registration.reminderLog).toEqual([entry])
    })
  })

  describe('Lessons subtitles', () => {
    it('rejects a malformed cue on introSubtitles', async () => {
      const { messages, status } = await rejected(() =>
        testData.createLesson(payload, {
          introSubtitles: [{ content: 'Hi', startTimeMs: 0 }],
        } as Parameters<typeof testData.createLesson>[1]),
      )

      expect(status).toBe(400)
      expect(messages).toMatch(/endTimeMs/)
    })

    it('rejects a malformed cue on a panel’s subtitles', async () => {
      // The panel field is `admin.condition`-gated on `media`, and Payload skips
      // validation entirely for a field whose condition is false — so the panel
      // needs its media for the schema to run at all.
      const media = await testData.createFile(payload)
      const { messages, status } = await rejected(() =>
        testData.createLesson(payload, {
          panels: [
            { title: 'Panel', media: media.id, subtitles: [{ content: 'Hi', startTimeMs: 0 }] },
          ],
        } as Parameters<typeof testData.createLesson>[1]),
      )

      expect(status).toBe(400)
      expect(messages).toMatch(/endTimeMs/)
    })

    it('accepts a well-formed cue', async () => {
      const cues = [{ content: 'Welcome', startTimeMs: 0, endTimeMs: 1500, durationMs: 1500 }]
      const lesson = await testData.createLesson(payload, { introSubtitles: cues })

      expect(lesson.introSubtitles).toEqual(cues)
    })
  })
})
