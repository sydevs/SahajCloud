import type { Event } from '@/payload-types'

/**
 * The stored `event.schedule` group, with the field's own `undefined` stripped.
 *
 * Values use RFC 5545 conventions: uppercase frequencies, two-letter day codes.
 * `lastDate`, `icalRule` and `upcomingDates` are derived columns recomputed on
 * write or read — they are part of the shape so a hook merging a previous
 * schedule doc over an incoming patch stays type-honest.
 *
 * Everything below derives from this rather than restating it. The hand-written
 * copies these replace were **wider than the CMS**: `firstDate_tz`, `weekdays`
 * and `weekNumber` were plain `string`/`string[]`, so `weekdays: ['Monday']`
 * type-checked and was then rejected at write (#671).
 */
export type EventSchedule = NonNullable<Event['schedule']>

/**
 * A single exclusion date range within the exclusions array.
 * When endDate is omitted, only startDate is excluded (single-date exclusion).
 *
 * Optional fields are `| null` because that is how Payload stores them, so a
 * schedule read off a document assigns without a cast.
 */
export type ExclusionRange = NonNullable<EventSchedule['exclusions']>[number]

/**
 * A schedule as the caller has it: any subset of the stored group.
 *
 * Not the same type as `Event['schedule']`, which keeps `firstDate` and
 * `firstDate_tz` required. Every reader here takes a field patch, a
 * `siblingData` merge or a partially-built schedule, so all members are
 * optional; `buildRRuleTemporal` guards each field it reads with a truthy check
 * or `??`, which treat `null` and `undefined` identically.
 */
export type EventScheduleInput = Partial<EventSchedule>
