import type { PaginatedDocs, PayloadRequest, Where } from 'payload'

import { stringify } from 'csv-stringify/sync'
import { extractID, formatAdminURL } from 'payload/shared'

import {
  readSubmissionValue,
  registrationAnswers,
} from '@/collections/UserSubmissions/submissionData'
import { EVENT_QUALITY_CHECK_METADATA, SKIP_REASON_LABELS } from '@/lib/eventQuality'
import { formatShortDate } from '@/lib/notifications/eventDetails'
import type { RegistrationAnswer } from '@/lib/registrations/questions'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { UserSubmission } from '@/payload-types'
import { isAdminManager, isManager } from '@/plugins/access/adminOnly'

import { buildPanelModel } from '../EventQualityPanel/model'
import { firstParam, pageParam } from '../helpers/searchParams'

export type RegistrationFilter = 'accepted' | 'pending' | 'withdrawn'

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
  counts: Record<RegistrationFilter, number>
  registrations: PaginatedDocs<RegistrationRow>
  /** The accepted registrants as a file (`endpoints/registrationsCsv.ts` on Events). */
  csvUrl: string
  /**
   * The event's edit view, where the Recommendations panel lists what to fix —
   * the empty state's call to action.
   */
  editUrl: string
  /**
   * The event's listing-quality recommendations, for the empty state alone —
   * so `null` whenever the event has any registration, and the report's cost
   * (a full document read plus the title templates) is paid only there.
   */
  recommendations: ListingRecommendations | null
}

/**
 * What the Recommendations panel on the Edit tab would say: the open items'
 * labels, or why the listing is not checked at all. The two are kept apart
 * because "nothing to improve" and "not checked" are different messages.
 */
export type ListingRecommendations =
  { checked: true; open: string[] } | { checked: false; reason: string }

/** There is no `PerPage` control, so this is the only page size. */
const PER_PAGE = 50

/**
 * The filter each status is listed under. Keyed by status, so a status added to
 * the collection is a build error here, and none can appear under two filters.
 *
 * `pending` is its own filter because nothing has confirmed it yet: screening
 * or the confirmation email is still to run (`DeliverSubmissions`).
 */
const FILTER_OF: Record<UserSubmission['status'], RegistrationFilter> = {
  accepted: 'accepted',
  pending: 'pending',
  rejected: 'withdrawn',
  spam: 'withdrawn',
  confirmed_spam: 'withdrawn',
  failed: 'withdrawn',
}

const statusesIn = (filter: RegistrationFilter) =>
  (Object.keys(FILTER_OF) as UserSubmission['status'][]).filter(
    (status) => FILTER_OF[status] === filter,
  )

const registrationsOf = (eventId: number, filter: RegistrationFilter): Where => ({
  and: [
    { type: { equals: 'registration' } },
    { event: { equals: eventId } },
    { status: { in: statusesIn(filter) } },
  ],
})

/**
 * What the table shows. The name is a `submissionData` pair; `senderEmail` is
 * `virtual: 'user.email'` (#630), which Payload resolves through the join in
 * the query, so the `select` needs no `user` beside it.
 */
const ROW_SELECT = {
  createdAt: true,
  senderEmail: true,
  startingAt: true,
  startingAt_tz: true,
  status: true,
  submissionData: true,
} as const

/** The view's URL state; anything unrecognised falls back to the first accepted page. */
export function parseRegistrationQuery(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): RegistrationQuery {
  const filter = firstParam(searchParams, 'filter')
  return {
    filter: filter === 'pending' || filter === 'withdrawn' ? filter : 'accepted',
    page: pageParam(searchParams),
  }
}

/**
 * The event, when the caller may read its registrants — its own active manager
 * or an admin — and `null` otherwise.
 *
 * That is narrower than the Events collection's `read` (project-wide) and its
 * `update` (a whole region subtree), so Payload's document gate cannot answer
 * it (`docs/rules/access.md`, "A collection's own `update` is wider than its
 * role grants"). `isManager` keeps out an inactive manager still named on the
 * event, whom the admin shell still admits.
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
  const ownManager = isManager(req.user) && managerId !== null && req.user.id === managerId
  return ownManager || isAdminManager(req.user) ? event : null
}

async function countRegistrations(
  req: PayloadRequest,
  eventId: number,
  filter: RegistrationFilter,
) {
  const { totalDocs } = await req.payload.count({
    collection: 'user-submissions',
    where: registrationsOf(eventId, filter),
    overrideAccess: true,
    req: localeIsolatedReq(req),
  })
  return totalDocs
}

function toRow(
  row: Pick<UserSubmission, 'id' | keyof typeof ROW_SELECT>,
  eventTimeZone: null | string | undefined,
): RegistrationRow {
  return {
    id: row.id,
    name: readSubmissionValue(row.submissionData, 'name')?.trim() ?? '',
    email: row.senderEmail?.trim() ?? '',
    registeredOn: formatShortDate(row.createdAt),
    attending: row.startingAt
      ? formatShortDate(row.startingAt, row.startingAt_tz || eventTimeZone || 'UTC') || null
      : null,
    status: row.status,
    answers: registrationAnswers(row.submissionData),
  }
}

/**
 * One event's registrants, or `null` when the caller may not see them — which
 * the view turns into the unauthorized redirect.
 *
 * ⚠ **The rows are read after the gate, never beside it.** They are
 * `user-submissions` — restricted personal data — so a `Promise.all` with the
 * gate would have read them for a refused visitor too. They go through
 * `overrideAccess: true` because the gate, not the collection's read access,
 * is the authority.
 */
export async function loadEventRegistrations(
  req: PayloadRequest,
  docID: number | string | undefined,
  query: RegistrationQuery,
): Promise<EventRegistrationsData | null> {
  const event = await readableEvent(req, docID)
  if (!event) return null

  const [page, accepted, pending, withdrawn] = await Promise.all([
    req.payload.find({
      collection: 'user-submissions',
      where: registrationsOf(event.id, query.filter),
      depth: 0,
      limit: PER_PAGE,
      page: query.page,
      select: ROW_SELECT,
      sort: '-createdAt',
      overrideAccess: true,
      req: localeIsolatedReq(req),
    }),
    countRegistrations(req, event.id, 'accepted'),
    countRegistrations(req, event.id, 'pending'),
    countRegistrations(req, event.id, 'withdrawn'),
  ])

  const eventTimeZone = event.schedule?.firstDate_tz
  return {
    filter: query.filter,
    counts: { accepted, pending, withdrawn },
    registrations: { ...page, docs: page.docs.map((row) => toRow(row, eventTimeZone)) },
    csvUrl: `${req.payload.config.routes.api}/events/${event.id}/registrations/csv`,
    editUrl: formatAdminURL({
      adminRoute: req.payload.config.routes.admin,
      path: `/collections/events/${event.id}`,
    }),
    recommendations:
      accepted + pending + withdrawn === 0 ? await listingRecommendations(req, event.id) : null,
  }
}

/**
 * The virtual `qualityReport` (`computeEventQualityReport`), read off the
 * draft — what the manager edits, and what the panel beside it reports on.
 *
 * ⚠ **No `select`.** The report is computed from the document it is read
 * with, so a narrowed read would report every unselected field as missing.
 */
async function listingRecommendations(
  req: PayloadRequest,
  eventId: number,
): Promise<ListingRecommendations | null> {
  const event = await req.payload.findByID({
    collection: 'events',
    id: eventId,
    depth: 0,
    draft: true,
    disableErrors: true,
    overrideAccess: true,
    trash: true,
    req: localeIsolatedReq(req),
  })
  const model = buildPanelModel(event?.qualityReport, EVENT_QUALITY_CHECK_METADATA)
  if (!model) return null
  if (model.skipped) return { checked: false, reason: SKIP_REASON_LABELS[model.reason] }
  return {
    checked: true,
    open: model.items.filter((item) => item.status === 'failed').map((item) => item.label),
  }
}

/**
 * The number on the Registrations tab: accepted registrations only, behind the
 * same gate as the view, so a refused visitor does not learn the count either.
 */
export async function countAcceptedRegistrations(
  req: PayloadRequest,
  docID: number | string | undefined,
): Promise<number | null> {
  const event = await readableEvent(req, docID)
  return event ? countRegistrations(req, event.id, 'accepted') : null
}

/**
 * The accepted registrants as a CSV, or `null` when the caller may not read
 * them. One column per question anyone answered, in the order first seen.
 *
 * ⚠ `escape_formulas` is load-bearing: every cell is text a visitor typed, and
 * a spreadsheet runs one starting with `=`, `+`, `-` or `@` as a formula. The
 * byte-order mark is for Excel, as in `eventImport/csv/template.ts`.
 */
export async function acceptedRegistrationsCsv(
  req: PayloadRequest,
  docID: number | string | undefined,
): Promise<null | string> {
  const event = await readableEvent(req, docID)
  if (!event) return null

  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: registrationsOf(event.id, 'accepted'),
    depth: 0,
    pagination: false,
    select: ROW_SELECT,
    sort: 'createdAt',
    overrideAccess: true,
    req: localeIsolatedReq(req),
  })
  const rows = docs.map((row) => toRow(row, event.schedule?.firstDate_tz))
  const questions = [...new Set(rows.flatMap((row) => row.answers.map(({ label }) => label)))]

  const header = ['Name', 'Email', 'Registered on', 'Attending', ...questions]
  const records = rows.map((row) => [
    row.name,
    row.email,
    row.registeredOn,
    row.attending ?? '',
    ...questions.map((label) => row.answers.find((answer) => answer.label === label)?.value ?? ''),
  ])
  return `﻿${stringify([header, ...records], { escape_formulas: true })}`
}
