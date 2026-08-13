import { describe, expect, it } from 'vitest'

import {
  FINISHED_RETENTION_MONTHS,
  resolveNextCheckAt,
} from '@/lib/eventVerification/watermark'
import type { EventScheduleInput } from '@/types/schedule'


/**
 * `resolveNextCheckAt` is the whole reason the ExpireEvents job needs only one
 * query: a transition is reachable if and only if it's expressed as a
 * watermark here. These pin each stage's rule.
 */

const NOW = new Date('2026-06-11T02:00:00.000Z')

/** A weekly schedule whose final occurrence ends on 2026-06-30 (London). */
const endingSchedule: EventScheduleInput = {
  firstDate: '2026-06-02T18:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  interval: 1,
  endingType: 'until',
  untilDate: '2026-06-30T00:00:00.000Z',
}

/** Same start, but it recurs forever. */
const openEndedSchedule: EventScheduleInput = {
  firstDate: '2026-06-02T18:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  interval: 1,
}

const asDate = (iso: string | null) => (iso == null ? null : new Date(iso))

describe('resolveNextCheckAt — pre-adoption stages', () => {
  it('waits on the schedule end, since there is no manager and so no cadence', () => {
    for (const stage of ['unverified', 'denied'] as const) {
      const result = asDate(resolveNextCheckAt({ stage, schedule: endingSchedule }))
      expect(result).not.toBeNull()
      // End of the final occurrence's local day, i.e. late on 2026-06-30.
      expect(result!.toISOString().slice(0, 10)).toBe('2026-06-30')
    }
  })

  it('is null for an open-ended recurrence — nothing will ever happen to it', () => {
    expect(resolveNextCheckAt({ stage: 'unverified', schedule: openEndedSchedule })).toBeNull()
  })

  it('is null for a dormant event — it has no schedule to run out', () => {
    expect(
      resolveNextCheckAt({ stage: 'unverified', schedule: endingSchedule, inactive: true }),
    ).toBeNull()
  })

  it('is null with no schedule at all', () => {
    expect(resolveNextCheckAt({ stage: 'denied', schedule: null })).toBeNull()
  })
})

describe('resolveNextCheckAt — ladder stages', () => {
  it('uses the stage deadline when the schedule outlasts it', () => {
    const deadline = new Date('2026-06-18T02:00:00.000Z')
    expect(
      resolveNextCheckAt({
        stage: 'verified',
        stageDeadline: deadline,
        schedule: openEndedSchedule,
      }),
    ).toBe(deadline.toISOString())
  })

  it('caps the deadline at the schedule end, so a run-out event finishes promptly', () => {
    // The cadence would be 90 days out, but the event holds its last session
    // on 2026-06-30 — without the cap it would read "verified" until September.
    const result = asDate(
      resolveNextCheckAt({
        stage: 'verified',
        stageDeadline: new Date('2026-09-09T02:00:00.000Z'),
        schedule: endingSchedule,
      }),
    )
    expect(result!.toISOString().slice(0, 10)).toBe('2026-06-30')
  })

  it('ignores the schedule for a dormant event (it never finishes)', () => {
    const deadline = new Date('2026-09-09T02:00:00.000Z')
    expect(
      resolveNextCheckAt({
        stage: 'verified',
        stageDeadline: deadline,
        schedule: endingSchedule,
        inactive: true,
      }),
    ).toBe(deadline.toISOString())
  })

  it('is null when a ladder stage has neither deadline nor schedule end', () => {
    expect(resolveNextCheckAt({ stage: 'expired', schedule: openEndedSchedule })).toBeNull()
  })
})

describe('resolveNextCheckAt — finished retention', () => {
  it('arms the retention deadline, measured from the schedule end', () => {
    const result = asDate(resolveNextCheckAt({ stage: 'finished', schedule: endingSchedule }))
    expect(result).not.toBeNull()
    const end = new Date('2026-06-30T22:59:59.999Z')
    const months =
      (result!.getUTCFullYear() - end.getUTCFullYear()) * 12 +
      (result!.getUTCMonth() - end.getUTCMonth())
    expect(months).toBe(FINISHED_RETENTION_MONTHS)
  })

  it('is null when the schedule never ends — no date to measure retention from', () => {
    expect(resolveNextCheckAt({ stage: 'finished', schedule: openEndedSchedule })).toBeNull()
  })

  it('ignores any stage deadline — retention is the only clock that matters', () => {
    const result = resolveNextCheckAt({
      stage: 'finished',
      stageDeadline: NOW,
      schedule: endingSchedule,
    })
    expect(result).not.toBe(NOW.toISOString())
    expect(new Date(result!).getTime()).toBeGreaterThan(NOW.getTime())
  })
})
