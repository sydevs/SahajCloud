/**
 * The two writes under `src/lib/atomicWrites/` (#1116).
 *
 * Both exist because a background writer reads a row, spends seconds sending an
 * email or rendering a page, and only then writes — so what these pin is what a
 * second writer working on the same row in that window keeps.
 *
 * They are exercised here rather than in the unit lane because neither is a
 * fold: one is a `jsonb ||` statement the database evaluates, and the other
 * turns on Payload re-selecting the row at write time.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_LOG_LIMIT, asLog, type LogEntry } from '@/fields'
import { appendLogEntry } from '@/lib/atomicWrites/appendLogEntry'
import { updateIfUnchanged } from '@/lib/atomicWrites/updateIfUnchanged'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const entry = (key: string): LogEntry => ({
  at: '2026-11-11T10:00:00.000Z',
  type: 'test',
  key,
  cells: { activity: `Entry ${key}` },
})

describe('atomic writes', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  const newEvent = async () => (await testData.createEvent(payload, { title: 'Atomic' })).id

  const storedLog = async (id: number) =>
    asLog(
      (await payload.findByID({ collection: 'events', id, depth: 0, overrideAccess: true }))
        .activityLog,
    )

  /** Write the column straight, so a case can start from a shape no hook would write. */
  const seedLog = (id: number, activityLog: unknown) =>
    payload.db.updateOne({
      collection: 'events',
      id,
      data: { activityLog } as never,
      req: undefined,
    })

  describe('appendLogEntry', () => {
    it('appends to a log nothing has written yet', async () => {
      const id = await newEvent()
      await seedLog(id, null)

      await appendLogEntry({ payload, collection: 'events', id, entry: entry('a') })

      expect((await storedLog(id)).map((row) => row.key)).toEqual(['a'])
    })

    it('keeps the entries of a writer working from the same stale copy', async () => {
      // The defect: both writers read `[]`, each wrote its own one-entry array,
      // and the second overwrote the first. Neither reads the column now.
      const id = await newEvent()
      await seedLog(id, [])

      await appendLogEntry({ payload, collection: 'events', id, entry: entry('first') })
      await appendLogEntry({ payload, collection: 'events', id, entry: entry('second') })

      expect((await storedLog(id)).map((row) => row.key)).toEqual(['first', 'second'])
    })

    it('trims to the shared limit, oldest first', async () => {
      const id = await newEvent()
      await seedLog(
        id,
        Array.from({ length: DEFAULT_LOG_LIMIT }, (_, index) => entry(`old-${index}`)),
      )

      await appendLogEntry({ payload, collection: 'events', id, entry: entry('newest') })

      const log = await storedLog(id)
      expect(log).toHaveLength(DEFAULT_LOG_LIMIT)
      expect(log[0].key).toBe('old-1')
      expect(log[log.length - 1].key).toBe('newest')
    })

    it('starts over on a column holding something other than an array', async () => {
      // `asLog` drops such a value on the read side, so the append must not
      // throw on it either — `jsonb_array_elements` would.
      const id = await newEvent()
      await seedLog(id, { not: 'an array' })

      await appendLogEntry({ payload, collection: 'events', id, entry: entry('only') })

      expect((await storedLog(id)).map((row) => row.key)).toEqual(['only'])
    })

    it('joins the transaction its request carries', async () => {
      // Two callers are `afterChange` hooks whose transaction has already
      // written the row they log on. A write on another connection would wait
      // on that row lock for ever; this proves it is the same connection.
      const id = await newEvent()
      await seedLog(id, [])

      const transactionID = await payload.db.beginTransaction()
      if (transactionID === null) throw new Error('the adapter opened no transaction')
      await appendLogEntry({
        payload,
        collection: 'events',
        id,
        entry: entry('rolled-back'),
        req: { payload, transactionID } as unknown as PayloadRequest,
      })
      await payload.db.rollbackTransaction(transactionID)

      expect(await storedLog(id)).toEqual([])
    })
  })

  describe('updateIfUnchanged', () => {
    const stageOf = async (id: number) =>
      (await payload.findByID({ collection: 'events', id, depth: 0, overrideAccess: true }))
        .verificationStage

    it('writes while the row still holds what the caller read', async () => {
      const id = await newEvent()

      const written = await updateIfUnchanged({
        payload,
        collection: 'events',
        id,
        expect: { verificationStage: { equals: 'verified' } },
        data: { verificationStage: 'reminded' },
        overrideAccess: true,
        context: { skipVerifyHook: true },
      })

      expect(written).toBe(true)
      expect(await stageOf(id)).toBe('reminded')
    })

    it('writes nothing once the row has moved', async () => {
      const id = await newEvent()
      await payload.update({
        collection: 'events',
        id,
        data: { verificationStage: 'escalated' },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })

      const written = await updateIfUnchanged({
        payload,
        collection: 'events',
        id,
        // What a slow caller read before the write above landed.
        expect: { verificationStage: { equals: 'verified' } },
        data: { verificationStage: 'reminded' },
        overrideAccess: true,
        context: { skipVerifyHook: true },
      })

      expect(written).toBe(false)
      expect(await stageOf(id)).toBe('escalated')
    })

    it('reads a null the caller read as a condition of its own', async () => {
      // `nextCheckAt` is null on an event with nothing scheduled, and the
      // ExpireEvents advance conditions on it as read.
      const id = await newEvent()
      await payload.db.updateOne({
        collection: 'events',
        id,
        data: { nextCheckAt: null } as never,
        req: undefined,
      })

      expect(
        await updateIfUnchanged({
          payload,
          collection: 'events',
          id,
          expect: { nextCheckAt: { equals: null } },
          data: { verificationStage: 'reminded' },
          overrideAccess: true,
          context: { skipVerifyHook: true },
        }),
      ).toBe(true)
      expect(await stageOf(id)).toBe('reminded')
    })
  })
})
