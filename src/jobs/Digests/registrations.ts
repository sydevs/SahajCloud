import type { PayloadRequest } from 'payload'

import {
  readSubmissionValue,
  registrationAnswers,
} from '@/collections/UserSubmissions/submissionData'
import type { DigestRegistrationGroup } from '@/emails/DigestEmail'
import { formatShortDate } from '@/lib/notifications'
import { activeRegistrationWhere } from '@/lib/registrations/active'
import { adminDocUrl } from '@/lib/utilities/adminUrl'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'

const PAGINATION_LIMIT = 200

/**
 * The events whose registrations route to this manager's digest.
 *
 * ⚠ **An event carrying an override address is left out.** That address gets
 * the notice immediately, at `Immediate` or not at all, so counting its
 * registrations here would send them twice — once to the override and once in
 * the digest.
 */
async function digestEvents(req: PayloadRequest, managerId: number) {
  const { docs } = await req.payload.find({
    collection: 'events',
    where: { and: [{ manager: { equals: managerId } }, { deletedAt: { exists: false } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: {
      registrationNotificationEmail: true,
      schedule: { firstDate_tz: true },
      title: true,
    },
  })
  return docs.filter((event) => !event.registrationNotificationEmail?.trim())
}

/**
 * The new registrations a program email carries, grouped by event.
 *
 * Read at `depth: 0` so no registration populates its event's virtual fields —
 * the #541 N+1 — and the registrant's name comes off `submissionData` rather
 * than the `users` row, which this job has no reason to read.
 */
export async function registrationGroups(args: {
  managerId: number
  req: PayloadRequest
  runStart: Date
  since: Date
}): Promise<DigestRegistrationGroup[]> {
  const { managerId, req, runStart, since } = args
  const events = await digestEvents(req, managerId)
  if (!events.length) return []

  const eventById = new Map(events.map((event) => [event.id, event]))
  const rowsByEvent = new Map<number, DigestRegistrationGroup['rows']>()

  let page = 1
  let hasNextPage = true
  while (hasNextPage) {
    const batch = await req.payload.find({
      collection: 'user-submissions',
      where: {
        and: [
          activeRegistrationWhere,
          { event: { in: [...eventById.keys()] } },
          { createdAt: { greater_than: since.toISOString() } },
          { createdAt: { less_than_equal: runStart.toISOString() } },
        ],
      },
      depth: 0,
      limit: PAGINATION_LIMIT,
      page,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: {
        event: true,
        senderEmail: true,
        startingAt: true,
        startingAt_tz: true,
        submissionData: true,
      },
      sort: 'createdAt',
    })
    for (const row of batch.docs) {
      const eventId = relationId(row.event)
      const event = eventId == null ? undefined : eventById.get(eventId)
      if (!event || eventId == null) continue
      const answers = registrationAnswers(row.submissionData)
      const zone = row.startingAt_tz || event.schedule?.firstDate_tz || 'UTC'
      const list = rowsByEvent.get(eventId) ?? []
      list.push({
        answers:
          answers.map((answer) => `${answer.label}: ${answer.value}`).join(' · ') || undefined,
        attending: row.startingAt ? formatShortDate(row.startingAt, zone) || null : null,
        email: row.senderEmail?.trim() ?? '',
        name: readSubmissionValue(row.submissionData, 'name')?.trim() || 'A registrant',
      })
      rowsByEvent.set(eventId, list)
    }
    hasNextPage = batch.hasNextPage
    page++
  }

  return events
    .filter((event) => rowsByEvent.get(event.id)?.length)
    .map((event) => {
      const rows = rowsByEvent.get(event.id) ?? []
      return {
        allUrl: adminDocUrl('events', `${event.id}/registrations`),
        heading: `${event.title?.trim() || `Event #${event.id}`} · ${rows.length} new`,
        rows,
      }
    })
}
