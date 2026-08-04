import { describe, expect, it } from 'vitest'

import { evaluateRegistrationGate, type RegistrationGateInput } from '@/lib/registrations/gating'

// The gate evaluates "ended" via `shouldFinish` (the stored-`lastDate` model),
// so fixtures carry real schedule sub-fields + a tz, and `now` is injected so
// the whole gate is deterministic rather than wall-clock-dependent.
const NOW = new Date('2026-07-22T12:00:00.000Z')
const TZ = 'Europe/London'
const PAST = '2026-01-01T10:00:00.000Z' // long before NOW → a one-off that has ended
const FUTURE = '2026-12-01T10:00:00.000Z' // after NOW → a one-off not yet started/ended
const STARTED = '2026-07-01T10:00:00.000Z' // ~3 weeks before NOW → a run already under way

/** An open sahaj-atlas one-off in the future (no recurrence, no limit). */
const openEvent: RegistrationGateInput = {
  registrationMode: 'sahaj-atlas',
  registrationLimit: null,
  inactive: false,
  schedule: { firstDate: FUTURE, firstDate_tz: TZ },
}

const gate = (event: RegistrationGateInput, registrationCount = 0) =>
  evaluateRegistrationGate({ event, registrationCount, now: NOW })

describe('evaluateRegistrationGate', () => {
  it('opens registration for a published, in-future, non-full atlas event', () => {
    expect(gate(openEvent)).toBeNull()
  })

  it('rejects external-mode events with external_registration', () => {
    expect(gate({ ...openEvent, registrationMode: 'external' })?.code).toBe('external_registration')
  })

  it('rejects an ended event (schedule run out) with event_ended', () => {
    const ended: RegistrationGateInput = {
      ...openEvent,
      schedule: { firstDate: PAST, firstDate_tz: TZ }, // one-off, day long past
    }
    expect(gate(ended)?.code).toBe('event_ended')
  })

  it('rejects a started limited-run course with registration_closed', () => {
    const startedCourse: RegistrationGateInput = {
      registrationMode: 'sahaj-atlas',
      registrationLimit: null,
      inactive: false,
      schedule: {
        // 8 weekly sessions from 3 weeks ago → the final one is still ahead of
        // NOW (not ended), but the run has already begun.
        firstDate: STARTED,
        firstDate_tz: TZ,
        recurrenceType: 'WEEKLY',
        interval: 1,
        endingType: 'count',
        count: 8,
      },
    }
    expect(gate(startedCourse)?.code).toBe('registration_closed')
  })

  it('never closes a recurring class with no ending (the boundary case)', () => {
    const openEndedClass: RegistrationGateInput = {
      registrationMode: 'sahaj-atlas',
      registrationLimit: null,
      inactive: false,
      schedule: {
        // started long ago, but it recurs forever → no lastDate, never closes
        firstDate: PAST,
        firstDate_tz: TZ,
        recurrenceType: 'WEEKLY',
        interval: 1,
        // no endingType/count/untilDate → open-ended
      },
    }
    expect(gate(openEndedClass)).toBeNull()
  })

  it('does not close a limited-run course that has not started yet', () => {
    const futureCourse: RegistrationGateInput = {
      registrationMode: 'sahaj-atlas',
      registrationLimit: null,
      inactive: false,
      schedule: {
        firstDate: FUTURE,
        firstDate_tz: TZ,
        recurrenceType: 'WEEKLY',
        interval: 1,
        endingType: 'until',
        untilDate: '2027-01-01',
      },
    }
    expect(gate(futureCourse)).toBeNull()
  })

  it('rejects a full event with event_full', () => {
    const limited: RegistrationGateInput = { ...openEvent, registrationLimit: 2 }
    expect(gate(limited, 1)).toBeNull()
    expect(gate(limited, 2)?.code).toBe('event_full')
  })

  it('prefers the more terminal reason: ended wins over a started course', () => {
    const finishedCourse: RegistrationGateInput = {
      registrationMode: 'sahaj-atlas',
      registrationLimit: null,
      inactive: false,
      schedule: {
        // 8 weekly sessions from PAST → the whole run is behind us: ended.
        firstDate: PAST,
        firstDate_tz: TZ,
        recurrenceType: 'WEEKLY',
        interval: 1,
        endingType: 'count',
        count: 8,
      },
    }
    expect(gate(finishedCourse)?.code).toBe('event_ended')
  })

  it('uses 409 for every state-based refusal', () => {
    expect(gate({ ...openEvent, registrationMode: 'external' })?.status).toBe(409)
    expect(gate({ ...openEvent, registrationLimit: 0 }, 0)?.status).toBe(409)
  })
})
