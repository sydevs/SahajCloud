import { describe, expect, it } from 'vitest'

import { evaluateRegistrationGate, type RegistrationGateInput } from '@/lib/registrations/gating'

const NOW = new Date('2026-07-22T12:00:00.000Z')
const PAST = '2026-01-01T10:00:00.000Z'
const FUTURE = '2026-12-01T10:00:00.000Z'

/** An open sahaj-atlas one-off in the future (no recurrence, no limit). */
const openEvent: RegistrationGateInput = {
  registrationMode: 'sahaj-atlas',
  registrationLimit: null,
  inactive: false,
  schedule: { firstDate: FUTURE, upcomingDates: [FUTURE] },
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
      schedule: { firstDate: PAST, upcomingDates: [] },
    }
    expect(gate(ended)?.code).toBe('event_ended')
  })

  it('rejects a started limited-run course with registration_closed', () => {
    const startedCourse: RegistrationGateInput = {
      registrationMode: 'sahaj-atlas',
      registrationLimit: null,
      inactive: false,
      schedule: {
        firstDate: PAST,
        upcomingDates: [FUTURE], // sessions remain → not ended, but the run has begun
        recurrenceType: 'WEEKLY',
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
        firstDate: PAST, // started long ago, but it recurs forever
        upcomingDates: [FUTURE],
        recurrenceType: 'WEEKLY',
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
        upcomingDates: [FUTURE],
        recurrenceType: 'WEEKLY',
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
        firstDate: PAST,
        upcomingDates: [], // fully finished
        recurrenceType: 'WEEKLY',
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
