/**
 * The open-items list, for one role.
 *
 * Two consumers: the three admin homes and the nightly digest. Both want the
 * same rows in the same order with the same wording, so the whole answer is
 * built here and each surface only decides how to draw it — the homes as a
 * `Table`, the email as an `ItemTable`.
 */

import type { OpenItemFilter } from './filters'
import type { PayloadRequest, Where } from 'payload'
import type { FlattenedField } from 'payload'

import { submissionRoutingRegionId } from '@/collections/UserSubmissions/lifecycle/mergeProposal'
import { labelForPath } from '@/collections/UserSubmissions/lifecycle/proposedChanges'
import { OPEN_REVIEW_STATUSES } from '@/collections/UserSubmissions/statuses'
import { VERDICT_LABELS } from '@/collections/UserSubmissions/statuses'
import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { asLog } from '@/fields'
import { CONTACT_EMAIL } from '@/lib/contact'
import { buildEventQualityReport, loadTitleTemplates } from '@/lib/eventQuality'
import { EVENT_QUALITY_COPY } from '@/lib/eventQuality/copy'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import type { Event, UserSubmission } from '@/payload-types'

import {
  loadRegionNodes,
  type OverviewArgs,
  type RegionNode,
  regionsWithNoManagerAbove,
  scopeRegionIds,
} from './scope'
import {
  openItem,
  type OpenItem,
  type OpenItemEvent,
  openItemFilters,
  type OpenItemRow,
  overviewProgress,
  type OverviewProgress,
  sortOpenItems,
} from './status'

const PAGE_READ_LIMIT = 500

/** Stages a region manager joins another manager's event at (`docs/rules/access.md`). */
const ESCALATED_STAGES = ['escalated', 'urgent', 'expired'] as const

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
  schedule: { lastDate: true },
} as const

/** The columns the listing-quality report reads, for the page's rows alone. */
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

type EventDoc = Pick<
  Event,
  | '_status'
  | 'createdAt'
  | 'id'
  | 'manager'
  | 'nextCheckAt'
  | 'qualityOpenCount'
  | 'region'
  | 'schedule'
  | 'title'
  | 'updatedAt'
  | 'verificationStage'
>

/** One page of open items, with everything a surface needs to draw it. */
export interface OpenItemsResult {
  items: OpenItem[]
  /** How many rows each filter holds, before paging. */
  counts: { all: number } & Record<OpenItemFilter, number>
  /** Every counted row in scope, however it is filtered. */
  open: number
  /** `null` for an admin, whose list has no denominator (`AtlasAdmin` shows no meter). */
  progress: null | OverviewProgress
}

function eventRow(
  doc: EventDoc,
  options: {
    noRegionManager: boolean
    proposal: OpenItemEvent['proposal']
    region: null | RegionNode
    /** The reader manages it — a region scope's "Your programs". */
    ownEvent: boolean
    /** A region manager sees recommendations on their own events only. */
    withRecommendations: boolean
  },
): OpenItemRow {
  return {
    kind: 'event',
    id: doc.id,
    title: doc.title?.trim() || 'Untitled program',
    verificationStage: doc.verificationStage,
    draft: doc._status === 'draft',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    nextCheckAt: doc.nextCheckAt ?? null,
    scheduleEnd: doc.schedule?.lastDate ?? null,
    hasManager: relationId(doc.manager) !== null,
    qualityOpenCount: options.withRecommendations ? (doc.qualityOpenCount ?? 0) : 0,
    proposal: options.proposal,
    region: options.region ? { id: options.region.id, name: options.region.name } : null,
    noRegionManager: options.noRegionManager,
    ownEvent: options.ownEvent,
  }
}

/** The fields a change proposal touches, in the Events config's own wording. */
function changedFields(proposed: unknown, fields: FlattenedField[]): string[] {
  if (typeof proposed !== 'object' || proposed === null || Array.isArray(proposed)) return []
  return Object.keys(proposed).map((key) => labelForPath([key], fields))
}

/** Where the last delivery attempt went, or nothing if none has been recorded. */
function lastDeliveredTo(submission: Pick<UserSubmission, 'activityLog'>): null | string {
  const deliveries = asLog(submission.activityLog).filter((entry) => entry.type === 'delivery')
  const last = deliveries[deliveries.length - 1]
  const cell = last?.cells?.sentTo
  if (typeof cell === 'string') return cell
  return typeof cell?.text === 'string' ? cell.text : null
}

const openProposalsWhere: Where = {
  and: [{ type: { equals: 'proposal' } }, { status: { in: [...OPEN_REVIEW_STATUSES] } }],
}

/**
 * The open proposals in play, read once.
 *
 * Read with `overrideAccess: true` whatever the caller asked for, and then
 * narrowed by this loader's own rules: a region manager's reach has to pass
 * `routingRegion` for a city the atlas does not hold yet (`docs/rules/access.md`),
 * and an admin's depends on where the delivery went — neither of which the
 * collection's `Where` can express. The rows never leave this module unfiltered.
 */
async function loadOpenProposals(req: PayloadRequest) {
  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: openProposalsWhere,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: {
      activityLog: true,
      createdAt: true,
      event: true,
      proposed: true,
      region: true,
      routingRegion: true,
      submissionData: true,
    },
  })
  return docs
}

/** Sign-ups the spam check refused and no admin has settled. */
async function loadRefusals(req: PayloadRequest): Promise<OpenItemRow[]> {
  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: { and: [{ type: { equals: 'registration' } }, { status: { equals: 'spam' } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { createdAt: true, screeningResult: true, submissionData: true },
  })
  return docs.map((doc) => {
    const verdict = doc.screeningResult?.verdict
    const name = readSubmissionValue(doc.submissionData, 'name')
    return {
      kind: 'refusal' as const,
      id: doc.id,
      title: name?.trim() || 'A refused sign-up',
      reason:
        verdict && verdict in VERDICT_LABELS ? VERDICT_LABELS[verdict] : 'refused by screening',
      receivedAt: doc.createdAt,
    }
  })
}

/** The events one scope lists, by id, with the per-row facts the statuses need. */
async function loadScopedEvents(
  args: OverviewArgs,
  nodes: Map<number, RegionNode>,
  regionIds: null | Set<number>,
): Promise<{ docs: EventDoc[]; ownEventIds: Set<number> }> {
  const { req, scope } = args
  const read = (where: Where) =>
    req.payload.find({
      collection: 'events',
      where,
      depth: 0,
      pagination: false,
      overrideAccess: args.overrideAccess,
      req: localeIsolatedReq(req),
      select: EVENT_SELECT,
    })

  if (scope.role === 'program') {
    const own = await read({ manager: { equals: scope.managerId } })
    return {
      docs: own.docs as EventDoc[],
      ownEventIds: new Set(own.docs.map((doc) => doc.id)),
    }
  }

  if (scope.role === 'region') {
    const ids = [...(regionIds ?? new Set<number>())]
    const or: Where[] = []
    if (scope.managerId !== null) or.push({ manager: { equals: scope.managerId } })
    if (ids.length) {
      or.push({
        and: [
          { region: { in: ids } },
          {
            or: [
              { verificationStage: { in: [...ESCALATED_STAGES] } },
              { verificationStage: { equals: 'unverified' } },
            ],
          },
        ],
      })
    }
    if (!or.length) return { docs: [], ownEventIds: new Set() }
    const found = await read(or.length === 1 ? or[0]! : { or })
    return {
      docs: found.docs as EventDoc[],
      ownEventIds: new Set(
        found.docs
          .filter((doc) => scope.managerId !== null && relationId(doc.manager) === scope.managerId)
          .map((doc) => doc.id),
      ),
    }
  }

  // Admin: only what nobody below them covers. A region with a manager
  // anywhere above it is that manager's work, and listing it here would ask an
  // admin to do everyone's.
  const unmanaged = [...regionsWithNoManagerAbove(nodes)]
  if (!unmanaged.length) return { docs: [], ownEventIds: new Set() }
  const found = await read({
    and: [
      { region: { in: unmanaged } },
      {
        or: [
          { verificationStage: { in: [...ESCALATED_STAGES] } },
          { verificationStage: { equals: 'unverified' } },
        ],
      },
    ],
  })
  return { docs: found.docs as EventDoc[], ownEventIds: new Set() }
}

/**
 * Every row one role sees, already ordered.
 *
 * ⚠ **A change proposal is a status on the event it changes, never a row of its
 * own.** Progress counts the scope's unfinished events, so a proposal listed
 * separately would make "N to go" exceed the denominator it is measured
 * against — and it is the same listing either way, which is also how a reader
 * reads it.
 */
export async function loadOpenItems(args: OverviewArgs): Promise<OpenItemsResult> {
  const { req, scope } = args
  const now = args.now ?? new Date()
  const nodes = await loadRegionNodes(req)
  const regionIds = await scopeRegionIds(args, nodes)
  const unmanagedRegions = regionsWithNoManagerAbove(nodes)

  const [{ docs: eventDocs, ownEventIds }, proposals] = await Promise.all([
    loadScopedEvents(args, nodes, regionIds),
    loadOpenProposals(req),
  ])

  const eventFields = req.payload.collections.events?.config.flattenedFields ?? []
  const byId = new Map(eventDocs.map((doc) => [doc.id, doc]))

  // Which proposals this role answers for, split by whether they name an event.
  const changeByEvent = new Map<number, OpenItemEvent['proposal']>()
  const standalone: OpenItemRow[] = []
  const extraEventIds: number[] = []

  for (const proposal of proposals) {
    const eventId = relationId(proposal.event)
    const routingRegion = submissionRoutingRegionId(proposal)
    const toContact = lastDeliveredTo(proposal) === CONTACT_EMAIL

    let mine = false
    if (scope.role === 'program') {
      // A change proposal on an event they manage. A new class is nobody's
      // program yet, so it is not theirs.
      mine = eventId !== null && byId.has(eventId)
    } else if (scope.role === 'region') {
      const inScope = routingRegion !== null && (regionIds?.has(routingRegion) ?? true)
      // Only what no program manager holds: a new class, or a change to a
      // listing nobody has adopted.
      mine =
        inScope &&
        (eventId === null || (byId.has(eventId) && relationId(byId.get(eventId)!.manager) === null))
    } else {
      // An admin answers for the proposals that reached nobody else.
      mine = toContact
    }
    if (!mine) continue

    if (eventId === null) {
      standalone.push({
        kind: 'proposal',
        id: proposal.id,
        title:
          readSubmissionValue(proposal.submissionData, 'name')?.trim() ||
          'A proposed meditation class',
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

  // An admin's proposal can name an event their own list does not hold, and
  // the row it belongs on is that event.
  if (extraEventIds.length) {
    const extra = await req.payload.find({
      collection: 'events',
      where: { id: { in: extraEventIds } },
      depth: 0,
      pagination: false,
      overrideAccess: args.overrideAccess,
      req: localeIsolatedReq(req),
      select: EVENT_SELECT,
    })
    for (const doc of extra.docs as EventDoc[]) byId.set(doc.id, doc)
  }

  const rows: OpenItemRow[] = [...standalone]
  for (const doc of byId.values()) {
    const regionId = relationId(doc.region)
    rows.push(
      eventRow(doc, {
        noRegionManager:
          scope.role === 'admin' && regionId !== null && unmanagedRegions.has(regionId),
        ownEvent: scope.role === 'region' && ownEventIds.has(doc.id),
        proposal: changeByEvent.get(doc.id) ?? null,
        region: regionId === null ? null : (nodes.get(regionId) ?? null),
        withRecommendations: scope.role !== 'region' || ownEventIds.has(doc.id),
      }),
    )
  }

  if (scope.role === 'admin') rows.push(...(await loadRefusals(req)))

  const items = sortOpenItems(rows.map((row) => openItem(row, now)))
  const counts = {
    all: items.length,
    'no-manager': 0,
    overdue: 0,
    recommendations: 0,
    review: 0,
  }
  for (const item of items) {
    for (const filter of openItemFilters(item)) counts[filter] += 1
  }

  const open = items.filter((item) => item.counts).length
  const total =
    [...byId.values()].filter((doc) => doc.verificationStage !== 'finished').length +
    standalone.length

  return {
    items,
    counts,
    open,
    progress: scope.role === 'admin' ? null : overviewProgress(open, total),
  }
}

/**
 * The failed listing-quality checks' labels, for the rows on one page.
 *
 * ⚠ **Paid for the page alone.** `qualityOpenCount` is a stored column a list
 * read already carries, so it is what places a row; the labels need the whole
 * event — description, images, address, schedule — and reading that for a
 * whole region subtree to render fifty rows is the #609 N+1 by another route.
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
      limit: PAGE_READ_LIMIT,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: QUALITY_SELECT,
    }),
  ])

  const labelsById = new Map<number, string[]>()
  for (const event of events.docs) {
    const report = buildEventQualityReport(event, { now, templates })
    if (report.skipped) continue
    labelsById.set(
      event.id,
      report.checks
        .filter((check) => check.status === 'failed')
        .map(
          (check): string | undefined =>
            EVENT_QUALITY_COPY[check.key as keyof typeof EVENT_QUALITY_COPY]?.label,
        )
        .filter((label): label is string => Boolean(label)),
    )
  }

  return items.map((item) => {
    if (item.row.kind !== 'event') return item
    const labels = labelsById.get(item.row.id)
    if (!labels?.length) return item
    return openItem({ ...item.row, recommendations: labels }, now)
  })
}
