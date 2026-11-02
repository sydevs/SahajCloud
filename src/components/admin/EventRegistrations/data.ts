import type { PayloadRequest, Where } from 'payload'

import { extractID } from 'payload/shared'

import { answersFrom, readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { formatShortDate } from '@/lib/notifications'
import { activeRegistrationWhere, withdrawnRegistrationWhere } from '@/lib/registrations/active'
import { buildRegistrationAnswers } from '@/lib/registrations/questions'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { isAdminManager } from '@/plugins/access/adminOnly'

import {
  REGISTRATIONS_PER_PAGE,
  type EventRegistrationsData,
  type RegistrationFilter,
  type RegistrationQuery,
  type RegistrationRow,
} from './model'

const FILTER_WHERE: Record<RegistrationFilter, Where> = {
  active: activeRegistrationWhere,
  withdrawn: withdrawnRegistrationWhere,
}

/**
 * One event's registrants, or `null` when the caller may not see them.
 *
 * **The event's own manager and an admin may; nobody else, a region manager
 * included.** That is narrower than the Events collection's `read`, which is
 * project-wide, and narrower than its `update`, which a whole region subtree
 * holds — so neither answers this question and the view cannot lean on
 * Payload's document gate for it (`docs/rules/access.md`, "A collection's own
 * `update` is wider than its role grants"). `null` is what the view turns into
 * the unauthorized redirect.
 *
 * The rows are read with `overrideAccess: true` and an explicit `where`,
 * because this gate — not the `user-submissions` read gate, which admits a
 * manager to every row their region reaches — is the authority. `depth: 0` and
 * a column list keep it to the registration row itself: the registrant's name
 * is a `submissionData` pair, so no `users` row is read for it.
 */
export async function loadEventRegistrations(
  req: PayloadRequest,
  docID: number | string | undefined,
  query: RegistrationQuery,
): Promise<EventRegistrationsData | null> {
  if (docID == null) return null

  // A server-component tree renders concurrently, so every read takes its own
  // `req` copy (src/collections/AGENTS.md).
  const event = await req.payload.findByID({
    collection: 'events',
    id: docID,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { manager: true, schedule: { firstDate_tz: true } },
    req: localeIsolatedReq(req),
  })
  if (!event) return null

  const managerId = event.manager == null ? null : extractID(event.manager)
  const ownManager =
    req.user?.collection === 'managers' && managerId !== null && req.user.id === managerId
  if (!ownManager && !isAdminManager(req.user)) return null

  const page = await req.payload.find({
    collection: 'user-submissions',
    where: { and: [FILTER_WHERE[query.filter], { event: { equals: event.id } }] },
    depth: 0,
    limit: REGISTRATIONS_PER_PAGE,
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

  return {
    query: { ...query, page: page.page ?? query.page },
    registrations: {
      ...page,
      docs: page.docs.map((row): RegistrationRow => ({
        id: row.id,
        // The row's own columns, not a `users` join: `prepareUserSubmission`
        // seeds that row *from* these, so the join is the derived copy.
        name: readSubmissionValue(row.submissionData, 'name')?.trim() ?? '',
        email: row.senderEmail?.trim() ?? '',
        registeredOn: formatShortDate(row.createdAt),
        attending: row.startingAt
          ? formatShortDate(row.startingAt, row.startingAt_tz || event.schedule?.firstDate_tz) ||
            null
          : null,
        status: row.status,
        answers: buildRegistrationAnswers(answersFrom(row.submissionData)),
      })),
    },
  }
}
