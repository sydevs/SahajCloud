import { describe, expect, it } from 'vitest'

import { daysUntilUnpublish, stageRule, unpublishDate } from '@/jobs/ExpireEvents/stageMachine'
import { VERIFICATION_STAGES } from '@/lib/eventVerification/stages'

const NOW = new Date('2026-06-11T02:00:00.000Z')

describe('nextStageTransition', () => {
  it('verified → reminded (due, manager only, +1wk, stays published)', () => {
    expect(stageRule('verified').onDue).toMatchObject({
      level: 'due',
      includeRegion: false,
      nextStage: 'reminded',
      offsetDays: 7,
      unpublish: false,
    })
  })

  it('reminded → escalated (adds region, +1wk)', () => {
    expect(stageRule('reminded').onDue).toMatchObject({
      level: 'escalated',
      includeRegion: true,
      nextStage: 'escalated',
      offsetDays: 7,
      unpublish: false,
    })
  })

  it('escalated → urgent (final reminder, region, +1wk, still published)', () => {
    expect(stageRule('escalated').onDue).toMatchObject({
      level: 'urgent',
      includeRegion: true,
      nextStage: 'urgent',
      offsetDays: 7,
      unpublish: false,
    })
  })

  it('urgent → expired (region, +2wk, unpublishes)', () => {
    expect(stageRule('urgent').onDue).toMatchObject({
      level: 'expired',
      includeRegion: true,
      nextStage: 'expired',
      offsetDays: 14,
      unpublish: true,
    })
  })

  it('expired → trash (terminal, no email)', () => {
    expect(stageRule('expired').onDue).toEqual({ kind: 'trash' })
  })

  it('finished → trash once its retention window elapses', () => {
    expect(stageRule('finished').onDue).toEqual({ kind: 'trash' })
  })

  it('never re-runs the finished-check on an already-finished event', () => {
    // Load-bearing: a due `finished` event is due *because* its retention
    // elapsed. Re-finishing it would push the retention out another 6 months
    // and it would never be trashed at all.
    expect(stageRule('finished').finishesOnRunOut).toBe(false)
    for (const stage of VERIFICATION_STAGES.filter((s) => s !== 'finished')) {
      expect(stageRule(stage).finishesOnRunOut).toBe(true)
    }
  })

  it('pre-adoption stages only wait on their schedule', () => {
    // No manager means no cadence: the sole transition is finishing when the
    // schedule runs out, which the finish-check performs before this action.
    expect(stageRule('unverified').onDue).toEqual({ kind: 'await-schedule' })
    expect(stageRule('denied').onDue).toEqual({ kind: 'await-schedule' })
  })

  it('defines a rule for every stage', () => {
    // The machine is an exhaustive Record, so this can only fail if a stage is
    // added without deciding what the nightly job does with it.
    for (const stage of VERIFICATION_STAGES) {
      expect(stageRule(stage).onDue.kind).toBeTruthy()
    }
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
