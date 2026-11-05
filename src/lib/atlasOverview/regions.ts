/**
 * The Regions overview and the Countries overview — one answer, two scopes.
 *
 * Every number is rolled up over a region's whole subtree, because that is
 * what a reader asking "how is Germany doing" means. One pass over the events
 * in scope does all of it: each event contributes to its own region and to
 * every ancestor, which is `rollUpRegionCounts`'s algorithm
 * (`src/lib/atlasSidebar/sidebarModel.ts`) with this table's counters instead
 * of the sidebar's published/total pair. Six counters cannot be expressed as
 * that pair, and calling it six times would walk the events six times.
 */

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import type { Region } from '@/payload-types'

import { loadRegionNodes, type OverviewArgs, type RegionNode, scopeRegionIds } from './scope'

const DAY_MS = 24 * 60 * 60 * 1000
export const SIGNUP_WINDOW_DAYS = 30

/** What one row of either overview shows. */
export interface RegionOverviewRow {
  id: number
  name: string
  level: Region['level']
  /** Managers listed on this region or any below it. */
  managers: number
  /** Events that are not finished. */
  programs: number
  /**
   * Events with a manager that are not overdue, over events that are not
   * finished — whole per cent, or `null` where there is nothing to be healthy.
   */
  healthy: null | number
  overdue: number
  unverified: number
  /** Sign-ups in the last 30 days, and the change on the 30 before that. */
  signups: { change: number; last30: number }
}

/** The counters one pass over the events fills, per region. */
interface RegionMetrics {
  healthyNumerator: number
  overdue: number
  programs: number
  signupsNow: number
  signupsPrevious: number
  unverified: number
}

const emptyMetrics = (): RegionMetrics => ({
  healthyNumerator: 0,
  overdue: 0,
  programs: 0,
  signupsNow: 0,
  signupsPrevious: 0,
  unverified: 0,
})

/** Stages that make a listing overdue — the ones a region manager is pulled into. */
const OVERDUE_STAGES = new Set(['escalated', 'expired', 'urgent'])

interface MetricEvent {
  hasManager: boolean
  regionId: number
  stage: string
  /** Sign-ups on this event in the current window, and in the one before it. */
  signupsNow: number
  signupsPrevious: number
}

/**
 * Roll each event up to its own region and every ancestor of it, in one pass.
 *
 * An ancestor outside `inScope` is skipped, so a manager's own subtree does
 * not accumulate the countries above it.
 */
export function rollUpRegionMetrics(
  events: MetricEvent[],
  nodes: Map<number, RegionNode>,
  inScope: Set<number>,
): Map<number, RegionMetrics> {
  const metrics = new Map<number, RegionMetrics>()
  const bump = (regionId: number, event: MetricEvent) => {
    if (!inScope.has(regionId)) return
    const current = metrics.get(regionId) ?? emptyMetrics()
    if (event.stage !== 'finished') {
      current.programs += 1
      if (event.hasManager && !OVERDUE_STAGES.has(event.stage)) current.healthyNumerator += 1
    }
    if (OVERDUE_STAGES.has(event.stage)) current.overdue += 1
    if (event.stage === 'unverified') current.unverified += 1
    current.signupsNow += event.signupsNow
    current.signupsPrevious += event.signupsPrevious
    metrics.set(regionId, current)
  }
  for (const event of events) {
    bump(event.regionId, event)
    for (const ancestorId of nodes.get(event.regionId)?.ancestorIds ?? []) bump(ancestorId, event)
  }
  return metrics
}

/** Managers listed on a region or anywhere below it, counted once each. */
function managersInSubtree(
  node: RegionNode,
  nodes: Map<number, RegionNode>,
  inScope: Set<number>,
): number {
  const managers = new Set<number>(node.managerIds)
  for (const other of nodes.values()) {
    if (!inScope.has(other.id)) continue
    if (!other.ancestorIds.includes(node.id)) continue
    for (const managerId of other.managerIds) managers.add(managerId)
  }
  return managers.size
}

function toRow(
  node: RegionNode,
  metrics: RegionMetrics,
  nodes: Map<number, RegionNode>,
  inScope: Set<number>,
): RegionOverviewRow {
  return {
    id: node.id,
    name: node.name,
    level: node.level,
    managers: managersInSubtree(node, nodes, inScope),
    programs: metrics.programs,
    healthy:
      metrics.programs > 0 ? Math.round((metrics.healthyNumerator / metrics.programs) * 100) : null,
    overdue: metrics.overdue,
    unverified: metrics.unverified,
    signups: {
      change: metrics.signupsNow - metrics.signupsPrevious,
      last30: metrics.signupsNow,
    },
  }
}

/**
 * Countries with no manager first, then by Healthy ascending.
 *
 * ⚠ **A region with nothing in it is not unhealthy.** `healthy: null` sorts
 * last rather than as zero, which would put every empty country above the ones
 * genuinely falling behind.
 */
export function sortRegionRows(
  rows: RegionOverviewRow[],
  managerless: (row: RegionOverviewRow) => boolean,
): RegionOverviewRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(managerless(b)) - Number(managerless(a)) ||
      (a.healthy ?? 101) - (b.healthy ?? 101) ||
      a.name.localeCompare(b.name),
  )
}

/**
 * Both overviews: the rows, ordered.
 *
 * `countriesOnly` is the admin's view — the top of the escalation ladder,
 * since a region with no manager of its own is still covered by its
 * ancestors' and a country is where that cover runs out.
 */
export async function loadRegionOverview(
  args: OverviewArgs & { countriesOnly?: boolean },
): Promise<RegionOverviewRow[]> {
  const { req } = args
  const now = args.now ?? new Date()
  const nodes = await loadRegionNodes(req)
  const scoped = await scopeRegionIds(args, nodes)
  const inScope = scoped ?? new Set(nodes.keys())

  const since = new Date(now.getTime() - 2 * SIGNUP_WINDOW_DAYS * DAY_MS)
  const windowStart = new Date(now.getTime() - SIGNUP_WINDOW_DAYS * DAY_MS)

  const [events, signups] = await Promise.all([
    req.payload.find({
      collection: 'events',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: { manager: true, region: true, verificationStage: true },
    }),
    req.payload.find({
      collection: 'user-submissions',
      where: {
        and: [
          { type: { equals: 'registration' } },
          { createdAt: { greater_than: since.toISOString() } },
        ],
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: { createdAt: true, event: true },
    }),
  ])

  const signupsByEvent = new Map<number, { now: number; previous: number }>()
  for (const row of signups.docs) {
    const eventId = relationId(row.event)
    if (eventId == null) continue
    const bucket = signupsByEvent.get(eventId) ?? { now: 0, previous: 0 }
    if (new Date(row.createdAt) >= windowStart) bucket.now += 1
    else bucket.previous += 1
    signupsByEvent.set(eventId, bucket)
  }

  const metricEvents: MetricEvent[] = []
  for (const event of events.docs) {
    const regionId = relationId(event.region)
    if (regionId == null) continue
    const bucket = signupsByEvent.get(event.id)
    metricEvents.push({
      hasManager: relationId(event.manager) !== null,
      regionId,
      signupsNow: bucket?.now ?? 0,
      signupsPrevious: bucket?.previous ?? 0,
      stage: event.verificationStage,
    })
  }

  const metrics = rollUpRegionMetrics(metricEvents, nodes, inScope)
  const listed = [...inScope]
    .map((id) => nodes.get(id))
    .filter((node): node is RegionNode => node !== undefined)
    .filter((node) => !args.countriesOnly || node.level === 'country')

  const rows = listed.map((node) =>
    toRow(node, metrics.get(node.id) ?? emptyMetrics(), nodes, inScope),
  )
  return sortRegionRows(rows, (row) => (nodes.get(row.id)?.managerIds.length ?? 0) === 0)
}
