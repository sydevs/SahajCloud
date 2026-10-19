/**
 * Refuses a class that repeats one the Atlas already lists: same type, same
 * region, same recurrence and weekdays, same local start time, and — for a
 * class with a hall — the same street.
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

import { getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'
import { relationId } from '@/lib/utilities/relationId'
import type { Event } from '@/payload-types'

type Candidate = Pick<Event, 'id' | 'title' | 'eventType' | 'schedule' | 'address' | 'inactive'>

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
      `This class repeats #${twin.id} "${twin.title ?? ''}": same type, region, weekdays, start time and street.`,
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
    select: { title: true, eventType: true, schedule: true, address: true, inactive: true },
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
  if (!start) return null
  const weekdays = [...(schedule.weekdays ?? [])].sort().join(',')
  const street = event.eventType === 'offline' ? streetKey(event.address?.street) : ''
  return [event.eventType, schedule.recurrenceType ?? 'once', weekdays, start, street].join('|')
}

function streetKey(street: string | null | undefined): string {
  return (street ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
