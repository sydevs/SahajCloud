import type { PaginatedDocs, PayloadRequest, Where } from 'payload'

import { extractID } from 'payload/shared'

import {
  readSubmissionValue,
  registrationAnswers,
} from '@/collections/UserSubmissions/submissionData'
import { formatShortDate } from '@/lib/notifications/eventDetails'
import { activeRegistrationWhere, withdrawnRegistrationWhere } from '@/lib/registrations/active'
import type { RegistrationAnswer } from '@/lib/registrations/questions'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { UserSubmission } from '@/payload-types'
import { isAdminManager } from '@/plugins/access/adminOnly'

import { firstParam, pageParam } from '../helpers/searchParams'

export type RegistrationFilter = 'active' | 'withdrawn'

export type RegistrationQuery = { filter: RegistrationFilter; page: number }

/**
 * One registrant, from the registration row's own columns.
 *
 * ⚠ `name`, `email` and every answer are text the visitor typed, so a renderer
 * must escape them and must never put one in an `href`
 * (`submissionData.ts`, `URL_EXEMPT_KEYS`).
 */
export type RegistrationRow = {
  id: number
  name: string
  email: string
  /** Formatted here, because only the server knows the event's timezone. */
  registeredOn: string
  /** Which occurrence they are attending, where the row names one. */
  attending: string | null
  status: UserSubmission['status']
  answers: RegistrationAnswer[]
}

export type EventRegistrationsData = {
  filter: RegistrationFilter
  registrations: PaginatedDocs<RegistrationRow>
}

/** There is no `PerPage` control, so this is the only page size. */
const PER_PAGE = 50

/** A `Record`, so a third filter is a build error here rather than reading as the first. */
const FILTER_WHERE: Record<RegistrationFilter, Where> = {
  active: activeRegistrationWhere,
  withdrawn: withdrawnRegistrationWhere,
}

const registrationsOf = (eventId: number, filter: RegistrationFilter): Where => ({
  and: [FILTER_WHERE[filter], { event: { equals: eventId } }],
})

/** The view's URL state; anything unrecognised falls back to the first active page. */
export function parseRegistrationQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): RegistrationQuery {
  return {
    filter: firstParam(searchParams, 'filter') === 'withdrawn' ? 'withdrawn' : 'active',
    page: pageParam(searchParams),
  }
}

/**
 * The event, when the caller may read its registrants — its own manager or an
 * admin — and `null` otherwise.
 *
 * That is narrower than the Events collection's `read` (project-wide) and its
 * `update` (a whole region subtree), so Payload's document gate cannot answer
 * it (`docs/rules/access.md`, "A collection's own `update` is wider than its
 * role grants").
 *
 * ⚠ **It reads the event itself rather than the `doc` prop Payload passes the
 * view.** That one is a `draft: true` read, and a region manager holds `update`
 * on every event in their subtree — so a draft-only reassignment of `manager`
 * would hand them the registrants of an event they do not run.
 */
async function readableEvent(req: PayloadRequest, docID: number | string | undefined) {
  if (docID == null) return null

  const event = await req.payload.findByID({
    collection: 'events',
    id: docID,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { manager: true, schedule: { firstDate_tz: true } },
    // An archived class is trashed, and its registrants are still its manager's
    // to read (src/collections/AGENTS.md).
    trash: true,
    // A server-component tree renders concurrently, so every read takes its
    // own `req` copy (src/collections/AGENTS.md).
    req: localeIsolatedReq(req),
  })
  if (!event) return null

  const managerId = event.manager == null ? null : extractID(event.manager)
  const ownManager =
    req.user?.collection === 'managers' && managerId !== null && req.user.id === managerId
  return ownManager || isAdminManager(req.user) ? event : null
}

/**
 * One event's registrants, or `null` when the caller may not see them — which
 * the view turns into the unauthorized redirect.
 *
 * ⚠ **The rows are read after the gate, never beside it.** They are
 * `user-submissions` — restricted personal data — so a `Promise.all` would
 * have read them for a refused visitor too. They go through
 * `overrideAccess: true` because the gate above, not the collection's read
 * access, is the authority. The name is a `submissionData` pair, so no
 * `users` row is read for it.
 */
export async function loadEventRegistrations(
  req: PayloadRequest,
  docID: number | string | undefined,
  query: RegistrationQuery,
): Promise<EventRegistrationsData | null> {
  const event = await readableEvent(req, docID)
  if (!event) return null

  const page = await req.payload.find({
    collection: 'user-submissions',
    where: registrationsOf(event.id, query.filter),
    depth: 0,
    limit: PER_PAGE,
    page: query.page,
    select: {
      createdAt: true,
      senderEmail: true,
      startingAt: true,
      startingAt_tz: true,
      status: true,
      submissionData: true,
    },
    sort: '-createdAt',
    overrideAccess: true,
    req: localeIsolatedReq(req),
  })

  const eventTimeZone = event.schedule?.firstDate_tz
  return {
    filter: query.filter,
    registrations: {
      ...page,
      docs: page.docs.map((row): RegistrationRow => ({
        id: row.id,
        name: readSubmissionValue(row.submissionData, 'name')?.trim() ?? '',
        email: row.senderEmail?.trim() ?? '',
        registeredOn: formatShortDate(row.createdAt),
        attending: row.startingAt
          ? formatShortDate(row.startingAt, row.startingAt_tz || eventTimeZone || 'UTC') || null
          : null,
        status: row.status,
        answers: registrationAnswers(row.submissionData),
      })),
    },
  }
}

/**
 * The number on the Registrations tab: active registrations only, behind the
 * same gate as the view, so a refused visitor does not learn the count either.
 */
export async function countActiveRegistrations(
  req: PayloadRequest,
  docID: number | string | undefined,
): Promise<number | null> {
  const event = await readableEvent(req, docID)
  if (!event) return null

  const { totalDocs } = await req.payload.count({
    collection: 'user-submissions',
    where: registrationsOf(event.id, 'active'),
    overrideAccess: true,
    req: localeIsolatedReq(req),
  })
  return totalDocs
}
