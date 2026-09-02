import type { Event } from '@/payload-types'

/**
 * The generated `event.schedule` group, with the field's own `undefined` stripped.
 *
 * Everything below derives from this rather than restating it. The hand-written
 * copies these replace were **wider than the CMS**: `firstDate_tz`, `weekdays`
 * and `weekNumber` were plain `string`/`string[]`, so `weekdays: ['Monday']`
 * type-checked and was then rejected at write (#671).
 */
type EventSchedule = NonNullable<Event['schedule']>

/**
 * A single exclusion date range within the exclusions array.
 * When endDate is omitted, only startDate is excluded (single-date exclusion).
 *
 * Optional fields are `| null` because that is how Payload stores them, so a
 * schedule read off a document assigns without a cast.
 */
export type ExclusionRange = NonNullable<EventSchedule['exclusions']>[number]

/**
 * Sub-field structure matching the PayloadCMS Group field sub-fields for a schedule.
 * Values use RFC 5545 conventions: uppercase frequencies, two-letter day codes.
 * Exported from src/types/ because it is shared between scheduleHooks.ts and
 * audiences/scheduleMatch.ts.
 *
 * `lastDate` is derived rather than an input — the stored column, recomputed
 * from the fields above on every write by `computeLastDate`. It is part of the
 * generated shape so hooks merging a previous schedule doc over an incoming
 * patch stay type-honest.
 */
export type ScheduleSubFields = EventSchedule

/**
 * A schedule as the caller has it: any subset of the stored group.
 *
 * `buildRRuleTemporal` guards every field it reads with a truthy check or `??`,
 * both of which treat `null` and `undefined` identically — so a document's
 * `| null` optionals and a partially-built patch are interchangeable here.
 */
export type EventScheduleInput = Partial<ScheduleSubFields>
