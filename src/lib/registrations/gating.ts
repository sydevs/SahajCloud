import type { EventRegistrationErrorCode } from '@/collections/Events/endpoints/responseTypes'
import { shouldFinish } from '@/lib/schedule/scheduleStatus'
import type { EventScheduleInput } from '@/types/schedule'

import { type EventFullnessInput, isEventFull } from './fullness'

/** The event fields the gate reads — structurally a subset of an Event doc. */
export interface RegistrationGateInput extends EventFullnessInput {
  inactive?: boolean | null
  schedule?: EventScheduleInput | null
}

/** A refusal: the machine-readable `code`, human `message`, and HTTP `status`. */
export interface RegistrationGateRejection {
  code: EventRegistrationErrorCode
  message: string
  status: number
}

// All state-based refusals share 409 — the event's current state conflicts with
// registering. The widget keys off `code`, not the status.
const CONFLICT = 409

/**
 * Decide whether a registration for `event` must be refused, and why. Pure: the
 * caller supplies a live `registrationCount` (for the capacity check) and `now`.
 * Returns the first applicable rejection, or `null` when registration is open.
 *
 * Order is deliberate — the most terminal / mode-level reason wins:
 * 1. `external` mode — the native endpoint doesn't own these registrations.
 * 2. ended — the schedule has fully run out (reuses `shouldFinish`).
 * 3. started course — a limited-run course closes once its first session begins.
 * 4. full — the count has reached the limit.
 */
export function evaluateRegistrationGate(args: {
  event: RegistrationGateInput
  registrationCount: number
  now: Date
}): RegistrationGateRejection | null {
  const { event, registrationCount, now } = args

  if (event.registrationMode === 'external') {
    return {
      code: 'external_registration',
      status: CONFLICT,
      message: 'This event is registered through an external service.',
    }
  }
  if (shouldFinish(event, now)) {
    return { code: 'event_ended', status: CONFLICT, message: 'This event has ended.' }
  }
  if (isStartedLimitedCourse(event.schedule, now)) {
    return {
      code: 'registration_closed',
      status: CONFLICT,
      message: 'Registration for this course has closed — it has already started.',
    }
  }
  if (isEventFull(event, registrationCount)) {
    return { code: 'event_full', status: CONFLICT, message: 'This event is full.' }
  }
  return null
}

/**
 * A limited-run course that has already begun. A course is a recurring schedule
 * (`recurrenceType`) with a defined end (`endingType` `count`/`until`, plus its
 * value). It binds to the whole run and closes at the first session
 * (`firstDate`, a stored UTC instant — a plain instant comparison is
 * timezone-correct). An open-ended recurring class (no ending) never closes, and
 * a one-off has no ongoing run to be mid-way through (an elapsed one-off is
 * caught by `shouldFinish` as `event_ended` instead).
 */
function isStartedLimitedCourse(
  schedule: EventScheduleInput | null | undefined,
  now: Date,
): boolean {
  if (!schedule?.recurrenceType) return false
  const hasEnding =
    (schedule.endingType === 'count' && schedule.count != null) ||
    (schedule.endingType === 'until' && schedule.untilDate != null)
  if (!hasEnding) return false
  if (!schedule.firstDate) return false
  return now >= new Date(schedule.firstDate)
}
