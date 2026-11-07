/** The open-items list, for one role — built once for the three homes and the digest. */

import type { FlattenedField, PayloadRequest, Where } from 'payload'

import { submissionRoutingRegionId } from '@/collections/UserSubmissions/lifecycle/mergeProposal'
import { labelForPath } from '@/collections/UserSubmissions/lifecycle/proposedChanges'
import { OPEN_REVIEW_STATUSES, VERDICT_LABELS } from '@/collections/UserSubmissions/statuses'
import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { getRegionManagers, getRegionTree, type RegionTree } from '@/lib/atlas/regionTree'
import { buildEventQualityReport, loadTitleTemplates } from '@/lib/eventQuality'
import { scheduleOneLine } from '@/lib/notifications/eventDetails'
import { listingProgressFromReport } from '@/lib/notifications/listingProgress'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Event } from '@/payload-types'

import { SPAM_SIGNUPS } from './refusals'
import { type OverviewArgs, type OverviewScope, scopeRegionIds } from './scope'
import {
  isProgramStage,
  openItem,
  type OpenItem,
  type OpenItemEvent,
  type OpenItemRow,
  overviewProgress,
  type OverviewProgress,
  OVERDUE_QUERY_STAGES,
  sortOpenItems,
} from './status'

/** A ceiling on reads nothing else bounds, so one pathological scope cannot load a table. */
const LIST_READ_LIMIT = 500

/** What a scope beyond the event's own manager lists: escalated or worse, or unadopted. */
const LISTED_STAGES = [...OVERDUE_QUERY_STAGES, 'unverified'] as const

const EVENT_SELECT = {
  title: true,
  verificationStage: true,
  _status: true,
  createdAt: true,
  updatedAt: true,
  nextCheckAt: true,
  qualityOpenCount: true,
  manager: true,
  region: true,
  schedule: {
    firstDate: true,
    firstDate_tz: true,
    lastDate: true,
    recurrenceType: true,
    interval: true,
    weekdays: true,
    monthlyMode: true,
    monthDay: true,
    weekNumber: true,
    weekdayOfMonth: true,
  },
} as const

/** The columns the listing-quality report reads. */
const QUALITY_SELECT = {
  title: true,
  _status: true,
  deletedAt: true,
  verificationStage: true,
  description: true,
  images: true,
  website: true,
  onlineUrl: true,
  contactPhone: true,
  contactEmail: true,
  address: true,
  schedule: true,
  languages: true,
} as const

export interface OpenItemsResult {
  items: OpenItem[]
  /** `null` for an admin, whose list has no denominator. */
  progress: null | OverviewProgress
}

/** The top-level fields a change proposal touches, in the Events config's own wording. */
function changedFields(proposed: unknown, fields: FlattenedField[]): string[] {
  if (typeof proposed !== 'object' || proposed === null || Array.isArray(proposed)) return []
  return Object.keys(proposed).map((key) => labelForPath([key], fields))
}

/** The regions nobody manages, at any level above them. */
function regionsWithNoManagerAbove(
  tree: RegionTree,
  managersById: Map<number, number[]>,
): Set<number> {
  const unmanaged = new Set<number>()
  for (const [id, chain] of tree.chainById) {
    if (!chain.some((link) => managersById.get(link)?.length)) unmanaged.add(id)
  }
  return unmanaged
}

/**
 * The open proposals that reach nobody but an admin, mirroring `deliverProposal`'s
 * routing: a new class routed nowhere or under no manager, or a change to an
 * unadopted listing in such a region.
 */
function adminProposalsWhere(unmanaged: number[]): Where {
  const unset = (path: string): Where => ({ [path]: { exists: false } })
  const unmanagedOr = (path: string): Where =>
    unmanaged.length ? { or: [unset(path), { [path]: { in: unmanaged } }] } : unset(path)
  const newClass: Where[] = [{ and: [unset('region'), unmanagedOr('routingRegion')] }]
  if (unmanaged.length) newClass.push({ region: { in: unmanaged } })
  return {
    or: [
      { and: [unset('event'), { or: newClass }] },
      { and: [{ event: { exists: true } }, unset('event.manager'), unmanagedOr('event.region')] },
    ],
  }
}

/** Memoized, because the digest asks once per manager per role. */
function loadOpenProposals(req: PayloadRequest, adminUnmanaged?: number[]) {
  const where: Where = {
    and: [
      { type: { equals: 'proposal' } },
      { status: { in: [...OPEN_REVIEW_STATUSES] } },
      ...(adminUnmanaged ? [adminProposalsWhere(adminUnmanaged)] : []),
    ],
  }
  return memoizeOnRequest(
    req,
    `atlasOverview:openProposals${adminUnmanaged ? ':admin' : ''}`,
    async () =>
      (
        await req.payload.find({
          collection: 'user-submissions',
          where,
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req: localeIsolatedReq(req),
          select: {
            createdAt: true,
            event: true,
            proposed: true,
            region: true,
            routingRegion: true,
            submissionData: true,
          },
        })
      ).docs,
  )
}

/** ⚠ Bounded, newest first: retention caps a spam wave's age, not its size. */
async function loadRefusals(req: PayloadRequest): Promise<OpenItemRow[]> {
  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: { and: SPAM_SIGNUPS },
    depth: 0,
    limit: LIST_READ_LIMIT,
    sort: '-createdAt',
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { createdAt: true, screeningResult: true, submissionData: true },
  })
  return docs.map((doc) => {
    const verdict = doc.screeningResult?.verdict
    return {
      kind: 'refusal' as const,
      id: doc.id,
      title: readSubmissionValue(doc.submissionData, 'name')?.trim() || 'A refused sign-up',
      reason:
        verdict && verdict in VERDICT_LABELS ? VERDICT_LABELS[verdict] : 'refused by screening',
      receivedAt: doc.createdAt,
    }
  })
}

/** A region scope's own events — inside `?region=` when it names one. */
function ownEventsWhere(scope: OverviewScope, regionIds: null | Set<number>): Where[] {
  if (scope.role !== 'region' || scope.managerId === null) return []
  const own: Where = { manager: { equals: scope.managerId } }
  if (scope.regionId === undefined) return [own]
  return regionIds?.size ? [{ and: [own, { region: { in: [...regionIds] } }] }] : []
}

/** The events one scope lists, or `null` for none. */
function scopedEventsWhere(
  scope: OverviewScope,
  regionIds: null | Set<number>,
  unmanaged: Set<number>,
): null | Where {
  if (scope.role === 'program') return { manager: { equals: scope.managerId } }
  const listedIn = (ids: number[]): Where[] =>
    ids.length
      ? [{ and: [{ region: { in: ids } }, { verificationStage: { in: [...LISTED_STAGES] } }] }]
      : []
  // ⚠ An admin sees only what nobody below them covers.
  const or: Where[] =
    scope.role === 'admin'
      ? listedIn([...unmanaged])
      : [...ownEventsWhere(scope, regionIds), ...listedIn([...(regionIds ?? [])])]
  if (!or.length) return null
  return or.length === 1 ? or[0]! : { or }
}

/**
 * A region scope's unfinished events, quiet ones included: its list holds only
 * what needs a hand, but progress is measured against everything it covers.
 */
async function countRegionPrograms(
  args: OverviewArgs,
  regionIds: null | Set<number>,
): Promise<number> {
  const { req, scope } = args
  if (scope.role !== 'region') return 0
  const covers: Where[] = [
    ...(regionIds?.size ? [{ region: { in: [...regionIds] } }] : []),
    ...ownEventsWhere(scope, regionIds),
  ]
  if (!covers.length) return 0
  const { totalDocs } = await req.payload.count({
    collection: 'events',
    where: { and: [{ verificationStage: { not_equals: 'finished' } }, { or: covers }] },
    overrideAccess: args.overrideAccess,
    req: localeIsolatedReq(req),
  })
  return totalDocs
}

/**
 * Every row one role sees, already ordered.
 *
 * ⚠ **A change proposal is a status on the event it changes, never a row**, or
 * "N to go" could exceed the denominator it is measured against.
 */
export async function loadOpenItems(args: OverviewArgs): Promise<OpenItemsResult> {
  const { now, req, scope } = args
  const tree = await getRegionTree(req)
  const regionIds = await scopeRegionIds(req, scope, tree)
  const unmanaged =
    scope.role === 'admin'
      ? regionsWithNoManagerAbove(tree, await getRegionManagers(req))
      : new Set<number>()

  const readEvents = async (where: Where) =>
    (
      await req.payload.find({
        collection: 'events',
        where,
        depth: 0,
        pagination: false,
        overrideAccess: args.overrideAccess,
        req: localeIsolatedReq(req),
        select: EVENT_SELECT,
      })
    ).docs

  const eventsWhere = scopedEventsWhere(scope, regionIds, unmanaged)
  const [events, proposals] = await Promise.all([
    eventsWhere ? readEvents(eventsWhere) : [],
    loadOpenProposals(req, scope.role === 'admin' ? [...unmanaged] : undefined),
  ])

  const eventFields = req.payload.collections.events?.config.flattenedFields ?? []
  const byId = new Map(events.map((doc) => [doc.id, doc]))
  const changeByEvent = new Map<number, OpenItemEvent['proposal']>()
  const standalone: OpenItemRow[] = []
  const extraEventIds: number[] = []

  for (const proposal of proposals) {
    const eventId = relationId(proposal.event)
    let mine = true
    if (scope.role === 'program') {
      // A new class is nobody's program yet.
      mine = eventId !== null && byId.has(eventId)
    } else if (scope.role === 'region') {
      // Only what no program manager holds: a new class routed into the scope,
      // or a change to an unadopted listing in it. ⚠ A change proposal carries
      // no region of its own, so its event decides (`resolveProposalRegion`).
      if (eventId === null) {
        const routingRegion = submissionRoutingRegionId(proposal)
        mine = routingRegion !== null && (regionIds?.has(routingRegion) ?? true)
      } else {
        mine = byId.has(eventId) && relationId(byId.get(eventId)!.manager) === null
      }
    }
    if (!mine) continue

    if (eventId === null) {
      standalone.push({
        kind: 'proposal',
        id: proposal.id,
        title: readSubmissionValue(proposal.submissionData, 'name')?.trim() || 'A proposed event',
        receivedAt: proposal.createdAt,
      })
      continue
    }
    changeByEvent.set(eventId, {
      changedFields: changedFields(proposal.proposed, eventFields),
      id: proposal.id,
      receivedAt: proposal.createdAt,
    })
    if (!byId.has(eventId)) extraEventIds.push(eventId)
  }

  // An admin's proposal can name an event their own list does not hold.
  if (extraEventIds.length) {
    for (const doc of await readEvents({ id: { in: extraEventIds } })) byId.set(doc.id, doc)
  }

  const rows: OpenItemRow[] = [...standalone]
  for (const doc of byId.values()) {
    const regionId = relationId(doc.region)
    const own =
      scope.role === 'region' &&
      scope.managerId !== null &&
      relationId(doc.manager) === scope.managerId
    rows.push({
      kind: 'event',
      id: doc.id,
      title: doc.title?.trim() || 'Untitled event',
      verificationStage: doc.verificationStage,
      draft: doc._status === 'draft',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      nextCheckAt: doc.nextCheckAt ?? null,
      scheduleEnd: doc.schedule?.lastDate ?? null,
      timing: scheduleOneLine(doc.schedule as Event['schedule']),
      hasManager: relationId(doc.manager) !== null,
      // A region manager sees recommendations on their own events only.
      qualityOpenCount: scope.role !== 'region' || own ? (doc.qualityOpenCount ?? 0) : 0,
      proposal: changeByEvent.get(doc.id) ?? null,
      ...(regionId !== null && unmanaged.has(regionId) && { unmanagedRegionId: regionId }),
      ownEvent: own,
    })
  }

  if (scope.role === 'admin') rows.push(...(await loadRefusals(req)))

  const items = sortOpenItems(rows.map((row) => openItem(row, now)))
  const programs =
    scope.role === 'region'
      ? await countRegionPrograms(args, regionIds)
      : [...byId.values()].filter((doc) => isProgramStage(doc.verificationStage)).length
  const total = programs + standalone.length

  return {
    items,
    progress:
      scope.role === 'admin'
        ? null
        : overviewProgress(items.filter((item) => item.counts).length, total),
  }
}

/**
 * The failed listing-quality checks' labels, for one page's rows.
 *
 * ⚠ **Paid for the page alone** — the report needs the whole event, and reading
 * that for a subtree to render fifty rows is the #609 N+1 by another route.
 */
export async function withRecommendations(
  req: PayloadRequest,
  items: OpenItem[],
  now: Date,
): Promise<OpenItem[]> {
  const ids = items
    .filter((item) => item.row.kind === 'event' && item.row.qualityOpenCount > 0)
    .map((item) => item.row.id)
  if (!ids.length) return items

  const [templates, events] = await Promise.all([
    loadTitleTemplates(req),
    req.payload.find({
      collection: 'events',
      where: { id: { in: ids } },
      depth: 0,
      draft: true,
      limit: LIST_READ_LIMIT,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: QUALITY_SELECT,
    }),
  ])

  const labelsById = new Map<number, string[]>()
  for (const event of events.docs) {
    const labels = listingProgressFromReport(
      buildEventQualityReport(event, { now, templates }),
    )?.open.map((suggestion) => suggestion.label)
    if (labels) labelsById.set(event.id, labels)
  }

  return items.map((item) => {
    if (item.row.kind !== 'event') return item
    const labels = labelsById.get(item.row.id)
    if (!labels?.length) return item
    return openItem({ ...item.row, recommendations: labels }, now)
  })
}
