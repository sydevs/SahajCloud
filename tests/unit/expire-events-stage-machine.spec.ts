import { describe, expect, it } from 'vitest'

import {
  computeNextCheckAt,
  nextStageTransition,
  shouldFinish,
} from '@/jobs/ExpireEvents/stageMachine'

const NOW = new Date('2026-06-11T02:00:00.000Z')

describe('nextStageTransition', () => {
  it('verified → reminded (manager only, +1wk, stays published)', () => {
    const t = nextStageTransition('verified')
    expect(t).toMatchObject({
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

  it('escalated → expired (region, +2wk, unpublishes)', () => {
    expect(nextStageTransition('escalated')).toMatchObject({
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
    expect(computeNextCheckAt(nextStageTransition('escalated')!, NOW)).toBe(
      '2026-06-25T02:00:00.000Z',
    )
  })

  it('returns null for the terminal (trash) transition', () => {
    expect(computeNextCheckAt(nextStageTransition('expired')!, NOW)).toBeNull()
  })
})

describe('shouldFinish', () => {
  const scheduledEnded = { firstDate: '2020-01-01T10:00:00.000Z', upcomingDates: [] }
  const scheduledActive = {
    firstDate: '2020-01-01T10:00:00.000Z',
    upcomingDates: ['2026-07-01T10:00:00.000Z'],
  }

  it('finishes a non-inactive event whose schedule has run out', () => {
    expect(shouldFinish({ inactive: false, schedule: scheduledEnded })).toBe(true)
  })

  it('never finishes an inactive event (even with an empty schedule)', () => {
    expect(shouldFinish({ inactive: true, schedule: scheduledEnded })).toBe(false)
  })

  it('does not finish an event with upcoming dates', () => {
    expect(shouldFinish({ inactive: false, schedule: scheduledActive })).toBe(false)
  })

  it('does not finish a scheduleless event (no firstDate)', () => {
    expect(shouldFinish({ inactive: false, schedule: { upcomingDates: [] } })).toBe(false)
    expect(shouldFinish({ inactive: false, schedule: null })).toBe(false)
    expect(shouldFinish({ inactive: false })).toBe(false)
  })
})
