import { describe, expect, it } from 'vitest'

import {
  buildStageTracker,
  formatStageDate,
} from '@/components/admin/VerificationStageField/timeline'
import type { NotificationLogEntry } from '@/lib/eventVerification/log'

const T0 = '2026-06-06T00:00:00.000Z' // verified (cycle open)
const T1 = '2026-06-13T00:00:00.000Z' // advanced verified → reminded
const T2 = '2026-06-20T00:00:00.000Z' // advanced reminded → escalated

const verification: NotificationLogEntry = {
  kind: 'verification',
  at: T0,
  by: { id: 1, name: 'Priya' },
  method: 're-save',
}
const reminderAt = (stage: string, at: string): NotificationLogEntry =>
  ({
    kind: 'reminder',
    stage,
    level: 'due',
    role: 'manager',
    at,
    manager: { id: 1, name: 'Priya' },
    channel: 'email',
    destination: 'p@x.com',
  }) as NotificationLogEntry

const byKey = (steps: ReturnType<typeof buildStageTracker>['steps']) =>
  Object.fromEntries(steps.map((s) => [s.key, s]))

describe('buildStageTracker', () => {
  it('always renders the three steps in order', () => {
    const { steps } = buildStageTracker({ log: [], currentStage: 'verified', nextCheckAt: null })
    expect(steps.map((s) => s.key)).toEqual(['verified', 'reminders', 'expired'])
    // upcoming reminders read as "Will Need Verification"; upcoming expired as "Will Expire"
    expect(steps.map((s) => s.label)).toEqual([
      'Last Verified',
      'Will Need Verification',
      'Will Expire',
    ])
    steps.forEach((s) => expect(s.caption).toBeTruthy())
  })

  it('fresh-verified: Verified current, Reminders upcoming, Expired projected', () => {
    const nextCheckAt = '2026-06-13T00:00:00.000Z' // verified advances → reminded
    const s = byKey(
      buildStageTracker({ log: [verification], currentStage: 'verified', nextCheckAt }).steps,
    )
    expect(s.verified).toMatchObject({ status: 'current', date: T0 })
    // upcoming reminders: future tense + when it will first need re-verification
    expect(s.reminders).toMatchObject({
      status: 'upcoming',
      label: 'Will Need Verification',
      date: nextCheckAt,
      datePrefix: 'on',
    })
    // expiry = nextCheckAt + 7 (reminded) + 7 (escalated) + 14 (urgent) = +28d
    expect(s.expired).toMatchObject({
      status: 'upcoming',
      label: 'Will Expire',
      datePrefix: 'if not verified by',
    })
    expect(s.expired.date).toBe('2026-07-11T00:00:00.000Z')
  })

  it('escalated → Reminders current (next reminder date), Verified done, Expired projected', () => {
    const log = [verification, reminderAt('verified', T1), reminderAt('reminded', T2)]
    const nextCheckAt = '2026-06-27T00:00:00.000Z' // escalated advances → urgent
    const s = byKey(buildStageTracker({ log, currentStage: 'escalated', nextCheckAt }).steps)
    expect(s.verified).toMatchObject({ status: 'done', date: T0 })
    expect(s.reminders).toMatchObject({
      status: 'current',
      label: 'Needs Verification',
      date: nextCheckAt,
      datePrefix: 'next reminder on',
    })
    // expiry = nextCheckAt + 14 (urgent)
    expect(s.expired).toMatchObject({
      status: 'upcoming',
      label: 'Will Expire',
      datePrefix: 'if not verified by',
    })
    expect(s.expired.date).toBe('2026-07-11T00:00:00.000Z')
  })

  it('expired → Expired current with the actual unpublish date (not projected)', () => {
    const log = [
      verification,
      reminderAt('verified', T1),
      reminderAt('reminded', T2),
      reminderAt('escalated', '2026-06-27T00:00:00.000Z'),
      reminderAt('urgent', '2026-07-04T00:00:00.000Z'),
    ]
    const s = byKey(buildStageTracker({ log, currentStage: 'expired', nextCheckAt: null }).steps)
    expect(s.verified.status).toBe('done')
    expect(s.reminders).toMatchObject({ status: 'done', label: 'Reminders Sent', date: null })
    expect(s.expired).toMatchObject({
      status: 'current',
      label: 'Expired',
      date: '2026-07-04T00:00:00.000Z',
      datePrefix: 'on',
    })
  })

  it('finished: a single "Finished" terminal step dated from updatedAt', () => {
    const updatedAt = '2026-07-20T00:00:00.000Z'
    const { steps } = buildStageTracker({
      log: [verification],
      currentStage: 'finished',
      nextCheckAt: null,
      updatedAt,
    })
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      key: 'finished',
      label: 'Finished',
      status: 'current',
      date: updatedAt,
    })
    expect(steps[0].caption).toBeTruthy()
  })

  it('an event that finishes before its next check shows Finishes, not a reminder', () => {
    // The watermark is capped by the schedule's end (see resolveNextCheckAt),
    // so here `nextCheckAt` IS the finish date — labelling it "next reminder"
    // and projecting an expiry off it would both be fiction.
    const scheduleEnd = '2026-06-30T22:59:59.999Z'
    const { steps } = buildStageTracker({
      log: [verification],
      currentStage: 'verified',
      nextCheckAt: scheduleEnd,
      scheduleEnd,
    })

    expect(steps.map((step) => step.key)).toEqual(['verified', 'finished'])
    expect(steps[1]).toMatchObject({ label: 'Finishes', status: 'upcoming', date: scheduleEnd })
    // No expiry projection anywhere — it is never going to expire.
    expect(steps.some((step) => step.datePrefix === 'if not verified by')).toBe(false)
  })

  it('keeps the ladder when the next reminder lands before the schedule ends', () => {
    const { steps } = buildStageTracker({
      log: [verification],
      currentStage: 'verified',
      nextCheckAt: '2026-06-18T00:00:00.000Z',
      scheduleEnd: '2027-01-01T00:00:00.000Z',
    })
    expect(steps.map((step) => step.key)).toEqual(['verified', 'reminders', 'expired'])
  })

  it('unverified: shows the whole pre-adoption journey and what adoption takes', () => {
    const { steps } = buildStageTracker({
      log: [],
      currentStage: 'unverified',
      nextCheckAt: null,
      updatedAt: '2026-07-20T00:00:00.000Z',
    })
    expect(steps.map((step) => step.key)).toEqual(['unverified', 'denied', 'verified'])
    expect(steps.map((step) => step.status)).toEqual(['current', 'upcoming', 'upcoming'])
    // The destination step has to say what the manager must actually do.
    expect(steps[2].caption).toContain('Assign a manager')
    // Denial is a possibility, not a past event.
    expect(steps[1].label).toBe('Could Be Denied')
  })

  it('denied: the same journey, one step further along', () => {
    const { steps } = buildStageTracker({
      log: [],
      currentStage: 'denied',
      nextCheckAt: null,
      updatedAt: '2026-07-20T00:00:00.000Z',
    })
    expect(steps.map((step) => step.key)).toEqual(['unverified', 'denied', 'verified'])
    expect(steps.map((step) => step.status)).toEqual(['done', 'current', 'upcoming'])
    expect(steps[1].caption).toContain('unpublished')
    // Only the stage the event actually sits at carries a date.
    expect(steps[1].date).toBe('2026-07-20T00:00:00.000Z')
    expect(steps[0].date).toBeNull()
  })

  it('a managed event never shows the pre-adoption steps', () => {
    const { steps } = buildStageTracker({
      log: [verification],
      currentStage: 'verified',
      nextCheckAt: '2026-07-01T00:00:00.000Z',
    })
    expect(steps.map((step) => step.key)).toEqual(['verified', 'reminders', 'expired'])
  })
})

describe('formatStageDate', () => {
  it('formats an ISO date in compact words', () => {
    // Zone-less input parses as local time, so the rendered day is the same in
    // every timezone (a midnight-UTC input renders as the previous day west of
    // UTC — rendering is intentionally viewer-local, see DATE_FORMAT).
    expect(formatStageDate('2026-06-13T12:00:00')).toBe('13 Jun 2026')
  })

  it('returns null for null/invalid', () => {
    expect(formatStageDate(null)).toBeNull()
    expect(formatStageDate('nope')).toBeNull()
  })
})
