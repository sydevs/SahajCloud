/**
 * The Regions overview and the Countries overview — one answer, two scopes.
 *
 * Every number is rolled up over a region's whole subtree, because that is
 * what a reader asking "how is Germany doing" means. One pass over the events
 * in scope does all of it, through `rollUpRegionTree`
 * (`src/lib/regionTree/rollUp.ts`) — the walk the sidebar's published/total
 * pair also instantiates. What is this table's own is the accumulator: six
 * counters plus a dated sign-up pair, which the sidebar's shape cannot carry
 * and which calling it six times would walk the events six times to fill.
 */

import { rollUpRegionTree } from '@/lib/regionTree/rollUp'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import type { Region } from '@/payload-types'

import { loadRegionNodes, type OverviewArgs, type RegionNode, scopeRegionIds } from './scope'
import { loadSignupWindows } from './signups'
import { isProgramStage, OVERDUE_QUERY_STAGES } from './status'

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
const OVERDUE_STAGES: Set<string> = new Set(OVERDUE_QUERY_STAGES)

interface MetricEvent {
  hasManager: boolean
  regionId: number
  stage: string
  /** Sign-ups on this event in the current window, and in the one before it. */
  signupsNow: number
  signupsPrevious: number
}

/** What one event adds to its own region's row and to every ancestor's. */
export function rollUpRegionMetrics(
  events: MetricEvent[],
  nodes: Map<number, RegionNode>,
  inScope: Set<number>,
): Map<number, RegionMetrics> {
  return rollUpRegionTree<MetricEvent, RegionMetrics>({
    bump: (metrics, event) => {
      if (isProgramStage(event.stage)) {
        metrics.programs += 1
        if (event.hasManager && !OVERDUE_STAGES.has(event.stage)) metrics.healthyNumerator += 1
      }
      if (OVERDUE_STAGES.has(event.stage)) metrics.overdue += 1
      if (event.stage === 'unverified') metrics.unverified += 1
      metrics.signupsNow += event.signupsNow
      metrics.signupsPrevious += event.signupsPrevious
    },
    chainOf: (event) => ({
      ancestorIds: nodes.get(event.regionId)?.ancestorIds ?? [],
      regionId: event.regionId,
    }),
    empty: emptyMetrics,
    inScope,
    items: events,
  })
}

/**
 * Managers listed on each region or anywhere below it, counted once each.
 *
 * ⚠ **The nodes are filtered, not just gated.** Every other roll-up here
 * offers an item to its own region and lets `inScope` refuse it; an
 * out-of-scope region's own managers must not reach an in-scope ancestor's
 * count at all, so this one drops the node before the walk.
 *
 * Asked per row instead, this walked the whole node table for each row it
 * emitted — an admin's ~200 country rows against a table of thousands cost a
 * million `includes` probes of blocking CPU on the render path.
 */
export function rollUpRegionManagers(
  nodes: Map<number, RegionNode>,
  inScope: Set<number>,
): Map<number, Set<number>> {
  return rollUpRegionTree<RegionNode, Set<number>>({
    bump: (managers, node) => {
      for (const managerId of node.managerIds) managers.add(managerId)
    },
    chainOf: (node) => ({ ancestorIds: node.ancestorIds, regionId: node.id }),
    empty: () => new Set<number>(),
    inScope,
    items: [...nodes.values()].filter((node) => inScope.has(node.id)),
  })
}

function toRow(
  node: RegionNode,
  metrics: RegionMetrics,
  managers: Map<number, Set<number>>,
): RegionOverviewRow {
  return {
    id: node.id,
    name: node.name,
    level: node.level,
    managers: managers.get(node.id)?.size ?? 0,
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
  // ⚠ **No `overrideAccess`, because this loader cannot honour one.** Every read
  // it makes is `overrideAccess: true` on purpose — a row's counts are a roll-up
  // over a whole subtree, and a reader's own grants would silently undercount a
  // region rather than refuse it. `scopeRegionIds` is what bounds this list, so
  // taking the flag would have told a caller auditing "is this scoped to the
  // reader's access?" the wrong thing.
  args: Omit<OverviewArgs, 'overrideAccess'> & { countriesOnly?: boolean },
): Promise<RegionOverviewRow[]> {
  const { req } = args
  const now = args.now ?? new Date()
  const nodes = await loadRegionNodes(req)
  const scoped = await scopeRegionIds(args, nodes)
  const inScope = scoped ?? new Set(nodes.keys())

  const [events, signupsByEvent] = await Promise.all([
    req.payload.find({
      collection: 'events',
      // ⚠ **Narrowed to the scope, not read whole.** `subtreeOf` is closed
      // downwards, so a region outside `inScope` cannot have an ancestor inside
      // it — which means `rollUpRegionMetrics` would discard every row this
      // excludes anyway. Unnarrowed, a region manager looking at one city read
      // every event on the atlas on each render.
      where: scoped ? { region: { in: [...scoped] } } : {},
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: { manager: true, region: true, verificationStage: true },
    }),
    loadSignupWindows({ now, req }),
  ])

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
  const managers = rollUpRegionManagers(nodes, inScope)
  const listed = [...inScope]
    .map((id) => nodes.get(id))
    .filter((node): node is RegionNode => node !== undefined)
    .filter((node) => !args.countriesOnly || node.level === 'country')

  const rows = listed.map((node) => toRow(node, metrics.get(node.id) ?? emptyMetrics(), managers))
  return sortRegionRows(rows, (row) => (nodes.get(row.id)?.managerIds.length ?? 0) === 0)
}
