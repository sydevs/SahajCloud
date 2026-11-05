/**
 * The tiles both a home and a statistics email show.
 *
 * Two blocks: **Verification health**, which a region manager and an admin get,
 * and **Analytics**, which everyone gets. Each tile may carry a change line,
 * and the two blocks get theirs from different places on purpose:
 *
 * - a **stage count** has no history on the event — the stage is overwritten in
 *   place — so its change comes from `atlas-snapshots`, the daily row the
 *   nightly task writes;
 * - a **sign-up count** is a dated row, so its change is two queries over
 *   `createdAt` and needs no snapshot at all.
 *
 * ⚠ **With no snapshot that old, a tile shows no change line.** Not a zero: a
 * freshly deployed environment, or one whose nightly task has been down for a
 * month and a half (`SNAPSHOT_RETENTION_DAYS`), knows nothing about 30 days
 * ago, and "+0" would claim it does.
 */

import type { PayloadRequest } from 'payload'

import { VERIFICATION_STAGES, type VerificationStage } from '@/lib/eventVerification/stages'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import type { AtlasSnapshotCounts } from '@/payload-types'

import { loadRegionNodes, type OverviewArgs, type RegionNode, scopeRegionIds } from './scope'
import { snapshotDate } from './snapshots'

const DAY_MS = 24 * 60 * 60 * 1000
export const CHANGE_WINDOW_DAYS = 30

/** One flat tile: a label, a value, and the two optional lines beside it. */
export interface StatTile {
  key: string
  label: string
  value: number
  /** "of N" — the denominator a share is read against. */
  of?: number
  /** The 30-day change, or `null` where nothing can say. */
  change: null | number
}

export interface OverviewStatistics {
  /** Region managers and admins only; a program manager has no ladder to watch. */
  health: StatTile[]
  analytics: StatTile[]
  /** The busiest listing, hidden for a manager with one. */
  mostRegistered: null | { id: number; registrations: number; title: string }
}

/** The ladder, in the order a listing climbs it. `reminded` rides with `verified`. */
const HEALTH_TILES: { label: string; stages: VerificationStage[] }[] = [
  { label: 'Verified', stages: ['verified', 'reminded'] },
  { label: 'Escalated', stages: ['escalated'] },
  { label: 'Urgent', stages: ['urgent'] },
  { label: 'Expired', stages: ['expired'] },
  { label: 'Unverified', stages: ['unverified'] },
]

/**
 * A snapshot's counts, summed over the regions in scope.
 *
 * ⚠ **Each row holds a region's OWN events**, so this is where the rollup
 * happens: summing over the scope's region set is the subtree rollup, with no
 * double counting, because every event is in exactly one region's bucket.
 */
export function sumSnapshot(
  counts: AtlasSnapshotCounts | null | undefined,
  regionIds: null | Set<number>,
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const [regionId, stages] of Object.entries(counts ?? {})) {
    if (regionIds && !regionIds.has(Number(regionId))) continue
    for (const [stage, n] of Object.entries(stages ?? {})) {
      totals[stage] = (totals[stage] ?? 0) + (n ?? 0)
    }
  }
  return totals
}

/** The snapshot from `CHANGE_WINDOW_DAYS` ago, or nothing if none was kept. */
async function loadComparisonSnapshot(
  req: PayloadRequest,
  now: Date,
): Promise<AtlasSnapshotCounts | null> {
  const date = snapshotDate(new Date(now.getTime() - CHANGE_WINDOW_DAYS * DAY_MS))
  const { docs } = await req.payload.find({
    collection: 'atlas-snapshots',
    where: { date: { equals: date } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { counts: true },
  })
  return (docs[0]?.counts as AtlasSnapshotCounts | undefined) ?? null
}

/** Events in scope by stage, live. */
async function liveStageCounts(
  args: OverviewArgs,
  regionIds: null | Set<number>,
): Promise<{ byStage: Record<string, number>; eventIds: number[] }> {
  const { docs } = await args.req.payload.find({
    collection: 'events',
    where:
      args.scope.role === 'program'
        ? { manager: { equals: args.scope.managerId } }
        : regionIds
          ? { region: { in: [...regionIds] } }
          : {},
    depth: 0,
    pagination: false,
    overrideAccess: args.overrideAccess,
    req: localeIsolatedReq(args.req),
    select: { region: true, verificationStage: true },
  })
  const byStage: Record<string, number> = {}
  for (const stage of VERIFICATION_STAGES) byStage[stage] = 0
  for (const doc of docs) byStage[doc.verificationStage] = (byStage[doc.verificationStage] ?? 0) + 1
  return { byStage, eventIds: docs.map((doc) => doc.id) }
}

/** Sign-ups on a set of events, split into this window and the one before it. */
async function signupCounts(
  req: PayloadRequest,
  eventIds: number[],
  now: Date,
): Promise<{ byEvent: Map<number, number>; now: number; previous: number }> {
  const empty = { byEvent: new Map<number, number>(), now: 0, previous: 0 }
  if (!eventIds.length) return empty

  const windowStart = new Date(now.getTime() - CHANGE_WINDOW_DAYS * DAY_MS)
  const since = new Date(now.getTime() - 2 * CHANGE_WINDOW_DAYS * DAY_MS)
  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: {
      and: [
        { type: { equals: 'registration' } },
        { event: { in: eventIds } },
        { createdAt: { greater_than: since.toISOString() } },
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { createdAt: true, event: true },
  })

  const result = { byEvent: new Map<number, number>(), now: 0, previous: 0 }
  for (const doc of docs) {
    const eventId = relationId(doc.event)
    if (eventId == null) continue
    if (new Date(doc.createdAt) >= windowStart) {
      result.now += 1
      result.byEvent.set(eventId, (result.byEvent.get(eventId) ?? 0) + 1)
    } else {
      result.previous += 1
    }
  }
  return result
}

/**
 * Every tile one scope shows.
 *
 * A program manager gets Analytics alone: the verification ladder is the shape
 * of somebody else's workload, and their own listing's place on it is already
 * the first row of their open items.
 */
export async function loadStatistics(args: OverviewArgs): Promise<OverviewStatistics> {
  const { req, scope } = args
  const now = args.now ?? new Date()
  const nodes: Map<number, RegionNode> = await loadRegionNodes(req)
  const regionIds = await scopeRegionIds(args, nodes)

  const { byStage, eventIds } = await liveStageCounts(args, regionIds)
  const [snapshot, signups] = await Promise.all([
    loadComparisonSnapshot(req, now),
    signupCounts(req, eventIds, now),
  ])

  const snapshotTotals = snapshot ? sumSnapshot(snapshot, regionIds) : null

  const health =
    scope.role === 'program'
      ? []
      : HEALTH_TILES.map(({ label, stages }) => {
          const value = stages.reduce((sum, stage) => sum + (byStage[stage] ?? 0), 0)
          const before = snapshotTotals
            ? stages.reduce((sum, stage) => sum + (snapshotTotals[stage] ?? 0), 0)
            : null
          return { key: label.toLowerCase(), label, value, change: before === null ? null : value - before }
        })

  const withSignups = signups.byEvent.size
  // A program manager's scope is their own events, which no region set
  // describes — so the snapshot, which is keyed by region, cannot say what
  // they had 30 days ago, and the tile shows no change rather than the map's.
  const programsBefore =
    scope.role !== 'program' && snapshotTotals
      ? Object.values(snapshotTotals).reduce((sum, n) => sum + n, 0)
      : null
  const analytics: StatTile[] = [
    {
      key: 'programs',
      label: 'Total programs',
      value: eventIds.length,
      change: programsBefore === null ? null : eventIds.length - programsBefore,
    },
    {
      key: 'registrations',
      label: 'Registrations',
      value: signups.now,
      change: signups.now - signups.previous,
    },
    {
      key: 'programs-with-signup',
      label: 'Programs with a sign-up',
      value: withSignups,
      of: eventIds.length,
      change: null,
    },
  ]

  return {
    analytics,
    health,
    mostRegistered: await mostRegistered(req, signups.byEvent, eventIds.length),
  }
}

/**
 * The busiest listing of the window.
 *
 * Hidden for a scope holding one program: naming the only listing somebody runs
 * as their most registered is a tile that can never say anything.
 */
async function mostRegistered(
  req: PayloadRequest,
  byEvent: Map<number, number>,
  programs: number,
): Promise<OverviewStatistics['mostRegistered']> {
  if (programs < 2) return null
  const ranked = [...byEvent.entries()].sort((a, b) => b[1] - a[1])
  const top = ranked[0]
  if (!top) return null
  const event = await req.payload.findByID({
    collection: 'events',
    id: top[0],
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { title: true },
  })
  if (!event) return null
  return {
    id: top[0],
    registrations: top[1],
    title: event.title?.trim() || 'Untitled program',
  }
}
