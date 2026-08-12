import { Temporal } from '@js-temporal/polyfill'

import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'
import type { EventSubmission } from '@/payload-types'


/**
 * Pure mapping from a submission's proposed values onto Events field data.
 * Only fields the submitter actually provided appear in the patch — Payload's
 * partial-update semantics then leave everything else on the target event
 * untouched, which is exactly what an update proposal means.
 */

/** The submission's simple schedule vocabulary → the real `scheduleFields` group. */
export function mapSubmissionSchedule(
  schedule: EventSubmission['schedule'],
): Record<string, unknown> | null {
  if (!schedule?.startDate || !schedule.startTime) return null

  const timezone = schedule.timezone?.trim() || 'UTC'
  const [hour = 0, minute = 0] = schedule.startTime.split(':').map(Number)

  let firstDate: string
  try {
    const zoned = Temporal.PlainDate.from(schedule.startDate.slice(0, 10)).toZonedDateTime({
      timeZone: timezone,
      plainTime: new Temporal.PlainTime(hour, minute),
    })
    firstDate = new Date(zoned.epochMilliseconds).toISOString()
  } catch {
    // An unknown IANA name — keep the submission reviewable rather than
    // unfixable: interpret the local time as UTC and let the manager correct.
    firstDate = `${schedule.startDate.slice(0, 10)}T${schedule.startTime}:00.000Z`
  }

  return {
    firstDate,
    firstDate_tz: timezone,
    ...(schedule.endTime ? { endTime: schedule.endTime } : {}),
    ...(schedule.scheduleType === 'weekly'
      ? {
          recurrenceType: 'WEEKLY',
          interval: 1,
          ...(schedule.weekdays?.length ? { weekdays: schedule.weekdays } : {}),
          ...(schedule.endDate ? { endingType: 'until', untilDate: schedule.endDate } : {}),
        }
      : {}),
  }
}

/**
 * The Events data patch a submission proposes. For a NEW event the accept op
 * layers required defaults on top; for an update proposal this is the whole
 * patch. There is deliberately no `title` mapping — accepted events keep the
 * target's title or get the auto-title fill.
 */
export function submissionEventPatch(submission: EventSubmission): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (submission.languages?.length) patch.languages = submission.languages
  if (submission.eventType) patch.eventType = submission.eventType
  if (submission.onlineUrl) patch.onlineUrl = submission.onlineUrl
  if (submission.contactName) patch.contactName = submission.contactName
  if (submission.contactEmail) patch.contactEmail = submission.contactEmail
  if (submission.contactPhone) patch.contactPhone = submission.contactPhone

  const address = submission.address
  if (address && Object.values(address).some((value) => value != null && value !== '')) {
    patch.address = address
  }

  const description = plainTextToLexical(submission.description)
  if (description) patch.description = description

  const schedule = mapSubmissionSchedule(submission.schedule)
  if (schedule) {
    patch.schedule = schedule
    patch.inactive = false
  }

  return patch
}
