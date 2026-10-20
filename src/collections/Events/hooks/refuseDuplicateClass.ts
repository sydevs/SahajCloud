/**
 * Refuses a class that repeats one the Atlas already lists: same type, same
 * region, same local start time, same place — the street for a class with a
 * hall, the join link for an online one — and the same schedule, down to the
 * date a one-off falls on and the cadence a repeat keeps.
 *
 * A `beforeValidate` hook rather than a field `validate`, so it runs for a
 * draft save too: the bulk import creates drafts, and a repeat has to be
 * refused there rather than at the publish. Drafts count as well — importing
 * one file twice makes one set of drafts, not two.
 *
 * Thrown as an `APIError` with its own sentence, which the admin form shows as
 * a toast and the import records as the row's reason.
 */

import type { CollectionBeforeValidateHook, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { getLocalDateISO, getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'
import { relationId } from '@/lib/utilities/relationId'
import type { Event } from '@/payload-types'

type Candidate = Pick<
  Event,
  'id' | 'title' | 'eventType' | 'schedule' | 'address' | 'onlineUrl' | 'inactive'
>

export const refuseDuplicateClass: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'create' && operation !== 'update') return data
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as Partial<Event>
  const twin = await findDuplicateClass(req, merged, originalDoc?.id as number | undefined)
  if (twin) {
    throw new APIError(
      `This class repeats #${twin.id} "${twin.title ?? ''}": same type, region, place, start time and schedule.`,
      400,
      { code: 'duplicate_class', eventId: twin.id },
      true,
    )
  }
  return data
}

/**
 * The class already listed that `event` would repeat, or null. Shared with the
 * bulk import, which checks each row before handing it to be created.
 */
export async function findDuplicateClass(
  req: PayloadRequest,
  event: Partial<Event>,
  exceptId?: number,
): Promise<null | { id: number; title: string }> {
  const key = classKey(event)
  const regionId = relationId(event.region)
  if (!key || regionId === null) return null

  const { docs } = await req.payload.find({
    collection: 'events',
    where: {
      and: [
        { region: { equals: regionId } },
        { eventType: { equals: event.eventType } },
        ...(exceptId === undefined ? [] : [{ id: { not_equals: exceptId } }]),
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: {
      title: true,
      eventType: true,
      schedule: true,
      address: true,
      onlineUrl: true,
      inactive: true,
    },
    req,
  })
  const twin = (docs as Candidate[]).find((candidate) => classKey(candidate) === key)
  return twin ? { id: twin.id, title: twin.title ?? '' } : null
}

/** The identity of a class with a time, or null for one without. */
export function classKey(event: Partial<Candidate>): string | null {
  const schedule = event.schedule
  if (event.inactive || !schedule?.firstDate || !schedule.firstDate_tz) return null
  const start = getLocalTimeHHMM(schedule.firstDate, schedule.firstDate_tz)
  const date = getLocalDateISO(schedule.firstDate, schedule.firstDate_tz)
  if (!start || !date) return null
  const weekdays = [...(schedule.weekdays ?? [])].sort().join(',')
  const place =
    event.eventType === 'offline' ? streetKey(event.address?.street) : urlKey(event.onlineUrl)
  return [
    event.eventType,
    schedule.recurrenceType ?? 'once',
    weekdays,
    start,
    place,
    cadenceKey(schedule, date),
  ].join('|')
}

/**
 * What still tells two schedules apart once type, weekdays and start time
 * match. A one-off is its date — two single classes at one address on
 * different days are two classes. A repeat is its cadence, which the first
 * date does not stand in for: the same weekly slot started in March and in
 * June is one class listed twice.
 */
function cadenceKey(schedule: NonNullable<Candidate['schedule']>, localDate: string): string {
  const every = schedule.interval ?? 1
  switch (schedule.recurrenceType) {
    case 'DAILY':
    case 'WEEKLY':
      return String(every)
    case 'MONTHLY':
      return schedule.monthlyMode === 'weekday'
        ? [every, schedule.weekNumber, schedule.weekdayOfMonth].join(',')
        : [every, schedule.monthDay].join(',')
    default:
      return localDate
  }
}

function streetKey(street: string | null | undefined): string {
  return (street ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function urlKey(url: string | null | undefined): string {
  return (url ?? '').trim().toLowerCase()
}
