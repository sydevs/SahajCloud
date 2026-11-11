/**
 * The two writes under `src/lib/atomicWrites/` (#1116).
 *
 * Both exist because a background writer reads a row, spends seconds sending an
 * email or rendering a page, and only then writes — so what these pin is what a
 * second writer working on the same row in that window keeps.
 *
 * They are exercised here rather than in the unit lane because neither is a
 * fold: one inserts a row of its own into the log's table, and the other turns
 * on Payload re-selecting the row at write time.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_LOG_LIMIT, asLog, type LogEntry, toLogRow } from '@/fields'
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

  /**
   * Put the log into a known state before the case appends to it. An ordinary
   * save, which is the point: it writes the version row too, and the appends
   * below are about what survives beside one.
   */
  const seedLog = (id: number, entries: LogEntry[]) =>
    payload.update({
      collection: 'events',
      id,
      data: { activityLog: entries.map(toLogRow) },
      context: { skipVerifyHook: true },
      overrideAccess: true,
    })

  describe('appendLogEntry', () => {
    it('appends to a log nothing has written yet', async () => {
      const id = await newEvent()
      await seedLog(id, [])

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

    it('reaches a draft read of a collection carrying versions', async () => {
      // `events` carries drafts, so the admin edit view — the Activity Log
      // table's only reader — loads the `latest: true` version row and never
      // the main one.
      const id = await newEvent()
      await seedLog(id, [])

      await appendLogEntry({ payload, collection: 'events', id, entry: entry('visible') })

      const drafted = await payload.findByID({
        collection: 'events',
        id,
        depth: 0,
        draft: true,
        overrideAccess: true,
      })
      expect(asLog(drafted.activityLog).map((row) => row.key)).toEqual(['visible'])
    })

    it('survives the next ordinary update of the same row', async () => {
      // `updateByID` loads the document it is about to write from that same
      // version row and writes the merged whole back, so an entry missing
      // there is an entry the next unrelated save deletes.
      const id = await newEvent()
      await seedLog(id, [])

      await appendLogEntry({ payload, collection: 'events', id, entry: entry('kept') })
      await payload.update({
        collection: 'events',
        id,
        data: { confidenceScore: 42 },
        context: { skipVerifyHook: true },
        overrideAccess: true,
      })

      expect((await storedLog(id)).map((row) => row.key)).toEqual(['kept'])
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
