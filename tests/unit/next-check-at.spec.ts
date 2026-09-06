import { describe, expect, it } from 'vitest'

import { isPreAdoptionStage, VERIFICATION_STAGES } from '@/lib/eventVerification/stages'
import { FINISHED_RETENTION_MONTHS, resolveNextCheckAt } from '@/lib/eventVerification/watermark'
import type { EventSchedule } from '@/types/schedule'

/**
 * `resolveNextCheckAt` is the whole reason the ExpireEvents job needs only one
 * query: a transition is reachable if and only if it is expressed as a
 * watermark here. These pin each stage's rule.
 */

const NOW = new Date('2026-06-11T02:00:00.000Z')

/** A weekly schedule whose final occurrence ends on 2026-06-30 (London). */
const endingSchedule: Partial<EventSchedule> = {
  firstDate: '2026-06-02T18:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  interval: 1,
  endingType: 'until',
  untilDate: '2026-06-30T00:00:00.000Z',
}

/** Same start, but it recurs forever. */
const openEndedSchedule: Partial<EventSchedule> = {
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
      // End of the final occurrence's local day, that is, late on 2026-06-30.
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

  it('falls back to the finish moment when there is no schedule end', () => {
    // An event can reach `finished` with nothing to measure from — the Atlas
    // importer maps a dump status straight to the stage, dormant and
    // open-ended recurrences included. Those rows used to keep a null
    // watermark and so could never be trashed.
    const now = new Date('2026-06-15T00:00:00.000Z')
    for (const input of [
      { schedule: openEndedSchedule },
      { schedule: endingSchedule, inactive: true },
      { schedule: null },
    ]) {
      const result = resolveNextCheckAt({ stage: 'finished', ...input, now })
      expect(result).not.toBeNull()
      expect(result!.slice(0, 7)).toBe('2026-12') // now + 6 months
    }
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

describe('the nullability contract', () => {
  // The question this pins: `nextCheckAt` is nullable, so which stages may
  // actually be null? Exactly one class — a pre-adoption stage with no
  // schedule end. Everything else always has a date, which is what makes each
  // transition reachable from the job's single `nextCheckAt <= now` query.
  const now = new Date('2026-06-15T00:00:00.000Z')
  const cadence = new Date('2026-09-01T00:00:00.000Z')

  /** What each stage's writer actually supplies: a cadence for the ladder, nothing else. */
  const deadlineFor = (stage: (typeof VERIFICATION_STAGES)[number]) =>
    isPreAdoptionStage(stage) || stage === 'finished' ? undefined : cadence

  it('is null only for a pre-adoption stage with nothing scheduled', () => {
    for (const stage of VERIFICATION_STAGES) {
      // Strip every schedule-derived input, leaving only what the stage's own
      // writer would pass. Pre-adoption stages have nothing left. Every other
      // stage still has a clock.
      const bare = resolveNextCheckAt({
        stage,
        stageDeadline: deadlineFor(stage),
        schedule: null,
        inactive: true,
        now,
      })
      if (isPreAdoptionStage(stage)) {
        expect(bare, `${stage} is pre-adoption — nothing is scheduled`).toBeNull()
      } else {
        expect(bare, `${stage} must stay reachable`).not.toBeNull()
      }
    }
  })

  it('is never null for any stage once the event has a schedule that ends', () => {
    for (const stage of VERIFICATION_STAGES) {
      const armed = resolveNextCheckAt({
        stage,
        stageDeadline: deadlineFor(stage),
        schedule: endingSchedule,
        now,
      })
      expect(armed, `${stage} with a schedule end`).not.toBeNull()
    }
  })
})
