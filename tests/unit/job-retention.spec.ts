/**
 * The `payload-jobs` retention window's own invariants. The window is asserted
 * rather than the constant beside it: `submission-retention.spec.ts` records
 * what happens when a spec pins a table nothing reads.
 */
import { describe, expect, it } from 'vitest'

import {
  JOB_PURGE_WINDOWS,
  JOB_RETENTION_DAYS,
  STALE_JOB_MS,
} from '@/collections/PayloadJobs/PayloadJobs'
import { dueWindows } from '@/jobs/CleanupCollections/sweepCollection'
import { IMPORT_STALL_MS } from '@/plugins/eventImport/constants'

describe('job retention', () => {
  it('puts the cutoff a week behind the clock it is given', () => {
    expect(dueWindows(JOB_PURGE_WINDOWS, new Date('2026-10-17T05:00:00.000Z'))[0]?.where).toEqual(
      JOB_PURGE_WINDOWS[0]!.where('2026-10-10T05:00:00.000Z'),
    )
  })

  /**
   * ⚠ The sweep moved from a weekly cron to the nightly registry run (#987),
   * and the window is what still bounds it. A row lives its full week either
   * way, so shortening this constant to "compensate" for the cadence would
   * delete a transcript's status earlier than anything asked for.
   */
  it('keeps the window at a week', () => {
    expect(JOB_RETENTION_DAYS).toBe(7)
  })

  /**
   * A queued row is old because its `waitUntil` has not arrived, so deleting it
   * would cancel work nobody asked to cancel. It carries neither marker below,
   * which is what makes it unreachable — so both arms have to stay named here,
   * and a window selecting on a bare date would fail.
   */
  it('selects a finished row and nothing else', () => {
    expect(JOB_PURGE_WINDOWS).toHaveLength(1)
    expect(JOB_PURGE_WINDOWS[0]!.where('2026-10-10T05:00:00.000Z')).toEqual({
      or: [
        { completedAt: { less_than: '2026-10-10T05:00:00.000Z' } },
        {
          and: [
            { hasError: { equals: true } },
            { updatedAt: { less_than: '2026-10-10T05:00:00.000Z' } },
          ],
        },
      ],
    })
  })
})

/**
 * The boot sweep's window is the only thing telling a dead run from a slow one:
 * nothing stamps a plain task's row between pick-up and finish, so cancelling
 * early takes a live run down and the window above then sweeps the evidence.
 */
describe('stale job cancellation', () => {
  /**
   * The import's own stall gate is the longest bound anything here declares,
   * and it was sized for a 500-row run. A job that can legitimately run longer
   * has to raise `STALE_JOB_MS` rather than lose a run to it.
   */
  it('waits longer than the longest run a healthy job declares', () => {
    expect(STALE_JOB_MS).toBeGreaterThan(IMPORT_STALL_MS)
  })
})
