import { describe, expect, it } from 'vitest'

import {
  computeNextCheckAt,
  daysUntilUnpublish,
  nextStageTransition,
  unpublishDate,
} from '@/jobs/ExpireEvents/stageMachine'

const NOW = new Date('2026-06-11T02:00:00.000Z')

describe('nextStageTransition', () => {
  it('verified → reminded (due, manager only, +1wk, stays published)', () => {
    expect(nextStageTransition('verified')).toMatchObject({
      level: 'due',
      includeRegion: false,
      nextStage: 'reminded',
      offsetDays: 7,
      unpublish: false,
    })
  })

  it('reminded → escalated (adds region, +1wk)', () => {
    expect(nextStageTransition('reminded')).toMatchObject({
      level: 'escalated',
      includeRegion: true,
      nextStage: 'escalated',
      offsetDays: 7,
      unpublish: false,
    })
  })

  it('escalated → urgent (final reminder, region, +1wk, still published)', () => {
    expect(nextStageTransition('escalated')).toMatchObject({
      level: 'urgent',
      includeRegion: true,
      nextStage: 'urgent',
      offsetDays: 7,
      unpublish: false,
    })
  })

  it('urgent → expired (region, +2wk, unpublishes)', () => {
    expect(nextStageTransition('urgent')).toMatchObject({
      level: 'expired',
      includeRegion: true,
      nextStage: 'expired',
      offsetDays: 14,
      unpublish: true,
    })
  })

  it('expired → trash (terminal, no email)', () => {
    expect(nextStageTransition('expired')).toMatchObject({
      level: null,
      nextStage: 'trash',
      offsetDays: null,
    })
  })

  it('finished is terminal (no transition)', () => {
    expect(nextStageTransition('finished')).toBeNull()
  })
})

describe('computeNextCheckAt', () => {
  it('adds the stage offset to now', () => {
    expect(computeNextCheckAt(nextStageTransition('verified')!, NOW)).toBe(
      '2026-06-18T02:00:00.000Z',
    )
  })

  it('returns null for the terminal (trash) transition', () => {
    expect(computeNextCheckAt(nextStageTransition('expired')!, NOW)).toBeNull()
  })
})

describe('daysUntilUnpublish', () => {
  it('sums the remaining offsets up to the urgent → expired transition', () => {
    expect(daysUntilUnpublish('verified')).toBe(21) // 7 + 7 + 7
    expect(daysUntilUnpublish('reminded')).toBe(14) // 7 + 7
    expect(daysUntilUnpublish('escalated')).toBe(7) // 7
    expect(daysUntilUnpublish('urgent')).toBe(0) // processing urgent unpublishes now
  })

  it('every pre-expiry stage points at the same absolute unpublish date', () => {
    const fromVerified = unpublishDate('verified', NOW).toISOString()
    const fromReminded = unpublishDate(
      'reminded',
      new Date('2026-06-18T02:00:00.000Z'),
    ).toISOString()
    expect(fromVerified).toBe('2026-07-02T02:00:00.000Z')
    expect(fromReminded).toBe(fromVerified)
  })
})

// `shouldFinish` moved to @/lib/schedule/scheduleStatus in #603 (it's now shared
// with the public feeds and the registration gate, and keys off the stored
// `schedule.lastDate` instead of the virtual `upcomingDates`). Its cases — and
// the agreement test against `notFinishedWhere` — live in
// tests/unit/schedule-status.spec.ts.
