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

import { type VerificationStage } from '@/lib/eventVerification/stages'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { AtlasSnapshotCounts } from '@/payload-types'

import { loadRegionNodes, type OverviewArgs, scopeRegionIds } from './scope'
import { loadSignupWindows, sumSignupWindows } from './signups'
import { countPrograms, isProgramStage } from './status'

const DAY_MS = 24 * 60 * 60 * 1000
export const CHANGE_WINDOW_DAYS = 30

/**
 * How a day is spelled in `atlas-snapshots`.
 *
 * Here with the reader rather than in its own module, because this is where
 * the key is read back: spelled twice, one side would eventually format a date
 * the other cannot find, and a tile with no comparison looks exactly like a
 * tile whose comparison is zero. The nightly task
 * (`jobs/AtlasSnapshot/RecordAtlasSnapshot.ts`) is the other caller, and it
 * writes the key this reads.
 */
export function snapshotDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/**
 * How a tile's change reads beside it: a sign, the number, and the window.
 *
 * Here beside `StatTile` and the window it measures, because the home renders
 * these tiles and the digest re-renders them as table cells — written at each,
 * neither copy read `CHANGE_WINDOW_DAYS`, so moving the window would have left
 * the page and the email saying different things about the same number.
 */
export function changeLabel(change: number): string {
  return `${change >= 0 ? '+' : ''}${change} in ${CHANGE_WINDOW_DAYS} days`
}

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

/**
 * Events in scope by stage, live, with the two id sets a tile needs.
 *
 * `eventIds` is every event in scope and bounds the sign-up queries, which
 * count a sign-up on a listing that has since finished — the Sign-ups column
 * beside them does too. `programIds` is the subset the reader is told are
 * programs, and is what every count of them is taken over.
 */
async function liveStageCounts(
  args: OverviewArgs,
  regionIds: null | Set<number>,
): Promise<{ byStage: Record<string, number>; eventIds: number[]; programIds: number[] }> {
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
  // No zero prefill: every reader already coalesces a missing stage, so seeding
  // the ladder only made a second place for the stage list to be wrong.
  const byStage: Record<string, number> = {}
  for (const doc of docs) byStage[doc.verificationStage] = (byStage[doc.verificationStage] ?? 0) + 1
  return {
    byStage,
    eventIds: docs.map((doc) => doc.id),
    programIds: docs.filter((doc) => isProgramStage(doc.verificationStage)).map((doc) => doc.id),
  }
}

/**
 * Sign-ups on a set of events: the two window totals, and the current window's
 * count per event.
 *
 * ⚠ **`byEvent` holds the current window only, and holds no zero.** Both its
 * readers ask about now rather than about the comparison — "Programs with a
 * sign-up" is its `size`, and Most registered its maximum — so an event whose
 * only sign-ups fell in the *previous* window must not appear, or a quiet
 * month's listing counts as one with a sign-up.
 *
 * ⚠ **The totals are over every event, `byEvent` over the programs alone.**
 * Both readers of `byEvent` are counted against a denominator of programs, so a
 * finished listing in it could put "Programs with a sign-up" above the Total
 * programs beside it. The Registrations total is not a count of programs and
 * matches the Sign-ups column, which counts a finished listing's sign-ups too.
 */
async function signupCounts(
  req: PayloadRequest,
  eventIds: number[],
  programIds: number[],
  now: Date,
): Promise<{ byEvent: Map<number, number>; now: number; previous: number }> {
  if (!eventIds.length) return { byEvent: new Map(), now: 0, previous: 0 }

  const windows = await loadSignupWindows({
    extraWhere: [{ event: { in: eventIds } }],
    now,
    req,
  })
  const programs = new Set(programIds)
  const byEvent = new Map<number, number>()
  for (const [eventId, window] of windows) {
    if (window.now > 0 && programs.has(eventId)) byEvent.set(eventId, window.now)
  }
  return { byEvent, ...sumSignupWindows(windows) }
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
  // The snapshot depends on neither the region tree nor the events, so it joins
  // the first wave rather than waiting two round trips for them.
  const [nodes, snapshot] = await Promise.all([
    loadRegionNodes(req),
    loadComparisonSnapshot(req, now),
  ])
  const regionIds = await scopeRegionIds(args, nodes)

  const { byStage, eventIds, programIds } = await liveStageCounts(args, regionIds)
  const signups = await signupCounts(req, eventIds, programIds, now)

  const snapshotTotals = snapshot ? sumSnapshot(snapshot, regionIds) : null

  const health =
    scope.role === 'program'
      ? []
      : HEALTH_TILES.map(({ label, stages }) => {
          const value = stages.reduce((sum, stage) => sum + (byStage[stage] ?? 0), 0)
          const before = snapshotTotals
            ? stages.reduce((sum, stage) => sum + (snapshotTotals[stage] ?? 0), 0)
            : null
          return {
            key: label.toLowerCase(),
            label,
            value,
            change: before === null ? null : value - before,
          }
        })

  const withSignups = signups.byEvent.size
  // A program manager's scope is their own events, which no region set
  // describes — so the snapshot, which is keyed by region, cannot say what
  // they had 30 days ago, and the tile shows no change rather than the map's.
  const programsBefore =
    scope.role !== 'program' && snapshotTotals ? countPrograms(snapshotTotals) : null
  const programs = programIds.length
  const analytics: StatTile[] = [
    {
      key: 'programs',
      label: 'Total programs',
      value: programs,
      change: programsBefore === null ? null : programs - programsBefore,
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
      of: programs,
      change: null,
    },
  ]

  return {
    analytics,
    health,
    mostRegistered: await mostRegistered(req, signups.byEvent, programs),
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
