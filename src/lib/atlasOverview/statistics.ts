/**
 * The tiles a home and a statistics email show.
 *
 * A stage is overwritten in place on the event, so a stage tile's change comes
 * from the nightly snapshot in `payload.kv`; a sign-up is a dated row, so its
 * change is read off `createdAt`.
 *
 * ⚠ **With no snapshot that old, a tile shows no change line**, never "+0".
 */

import type { PayloadRequest, Where } from 'payload'

import { getRegionTree } from '@/lib/atlas/regionTree'
import { addDays } from '@/lib/eventVerification/periods'
import type { VerificationStage } from '@/lib/eventVerification/stages'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'

import { WINDOW_DAYS } from './filters'
import { listPath } from './listPath'
import { type OverviewArgs, scopeRegionIds } from './scope'
import { countPrograms, isProgramStage } from './status'

/** One day's snapshot: region id → verification stage → that region's own events. */
export type AtlasSnapshotCounts = Record<string, Partial<Record<VerificationStage, number>>>

export const SNAPSHOT_KEY_PREFIX = 'atlas-snapshot:'

/** ⚠ The nightly task writes the key this reads, so both spell the day here. */
export function snapshotDate(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function snapshotKey(date: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${date}`
}

/**
 * Each event under its own region by stage — what a snapshot stores, and what
 * the live tiles sum, so the two count the same set. An event with no region
 * is in neither.
 */
export function countByRegion(
  events: Iterable<{ region?: unknown; verificationStage: string }>,
  counts: AtlasSnapshotCounts = {},
): AtlasSnapshotCounts {
  for (const event of events) {
    const regionId = relationId(event.region)
    if (regionId === null) continue
    const stages = (counts[String(regionId)] ??= {})
    const stage = event.verificationStage as VerificationStage
    stages[stage] = (stages[stage] ?? 0) + 1
  }
  return counts
}

/** ⚠ A snapshot holds each region's OWN events, so summing over the scope is the subtree rollup. */
function sumSnapshot(
  counts: AtlasSnapshotCounts,
  regionIds: null | Set<number>,
): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const [regionId, stages] of Object.entries(counts)) {
    if (regionIds && !regionIds.has(Number(regionId))) continue
    for (const [stage, n] of Object.entries(stages)) totals[stage] = (totals[stage] ?? 0) + (n ?? 0)
  }
  return totals
}

/** Sign-ups per event in the last window and the one before it, from one read over both. */
export async function loadSignupWindows(args: {
  extraWhere?: Where[]
  now: Date
  req: PayloadRequest
}): Promise<Map<number, { now: number; previous: number }>> {
  const { extraWhere = [], now, req } = args
  const windowStart = addDays(now, -WINDOW_DAYS)
  const { docs } = await req.payload.find({
    collection: 'user-submissions',
    where: {
      and: [
        { type: { equals: 'registration' } },
        { createdAt: { greater_than: addDays(now, -2 * WINDOW_DAYS).toISOString() } },
        ...extraWhere,
      ],
    },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
    select: { createdAt: true, event: true },
  })

  const byEvent = new Map<number, { now: number; previous: number }>()
  for (const doc of docs) {
    const eventId = relationId(doc.event)
    if (eventId === null) continue
    const bucket = byEvent.get(eventId) ?? { now: 0, previous: 0 }
    if (new Date(doc.createdAt) >= windowStart) bucket.now += 1
    else bucket.previous += 1
    byEvent.set(eventId, bucket)
  }
  return byEvent
}

export interface StatTile {
  key: string
  label: string
  value: number
  /** "of N" — the denominator a share is read against. */
  of?: number
  /** The 30-day change, or `null` where nothing can say. */
  change: null | number
  /** Which way the change is good news, so a reader can tell better from worse. */
  better?: 'down' | 'up'
  /** The admin list of what the tile counts, under the admin route; absent where the reader has none. */
  path?: `/${string}`
}

/** How far back a missing day may be covered by an older snapshot. */
const SNAPSHOT_TOLERANCE_DAYS = 7

/**
 * The newest snapshot at least 30 days old and at most a week older, so one
 * missed nightly run does not blank every change line for a day.
 */
async function snapshotBefore(req: PayloadRequest, now: Date): Promise<AtlasSnapshotCounts | null> {
  const newest = snapshotKey(snapshotDate(addDays(now, -WINDOW_DAYS)))
  const oldest = snapshotKey(snapshotDate(addDays(now, -WINDOW_DAYS - SNAPSHOT_TOLERANCE_DAYS)))
  const key = (await req.payload.kv.keys())
    .filter((candidate) => candidate >= oldest && candidate <= newest)
    .sort()
    .at(-1)
  return key ? req.payload.kv.get<AtlasSnapshotCounts>(key) : null
}

export interface OverviewStatistics {
  /** Empty for a program manager, who has no ladder to watch. */
  health: StatTile[]
  analytics: StatTile[]
  /** The busiest listing, hidden for a scope with one. */
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

/** Every tile one scope shows. */
export async function loadStatistics(args: OverviewArgs): Promise<OverviewStatistics> {
  const { now, req, scope } = args
  const [tree, snapshot] = await Promise.all([getRegionTree(req), snapshotBefore(req, now)])
  const regionIds = await scopeRegionIds(req, scope, tree)
  const inScope: Where =
    scope.role === 'program'
      ? { manager: { equals: scope.managerId } }
      : { region: regionIds ? { in: [...regionIds] } : { exists: true } }
  // ⚠ Registrations appear for nobody but an admin, who alone reads a region scope with no manager.
  const readsSubmissions =
    scope.role === 'admin' || (scope.role === 'region' && scope.managerId === null)

  const { docs } = await req.payload.find({
    collection: 'events',
    where: inScope,
    depth: 0,
    pagination: false,
    overrideAccess: args.overrideAccess,
    req: localeIsolatedReq(req),
    select: { region: true, title: true, verificationStage: true },
  })

  let byStage: Record<string, number> = {}
  if (scope.role === 'program') {
    for (const doc of docs)
      byStage[doc.verificationStage] = (byStage[doc.verificationStage] ?? 0) + 1
  } else {
    byStage = sumSnapshot(countByRegion(docs), regionIds)
  }
  const before = snapshot ? sumSnapshot(snapshot, regionIds) : null

  const health =
    scope.role === 'program'
      ? []
      : HEALTH_TILES.map(({ label, stages }) => {
          const sum = (counts: Record<string, number>) =>
            stages.reduce((total, stage) => total + (counts[stage] ?? 0), 0)
          const value = sum(byStage)
          return {
            key: label.toLowerCase(),
            label,
            value,
            change: before ? value - sum(before) : null,
            // More verified listings is the one rise that is good news on the ladder.
            better: label === 'Verified' ? ('up' as const) : ('down' as const),
            path: listPath('events', [inScope, { verificationStage: { in: stages } }]),
          }
        })

  const programs = new Map(
    docs.filter((doc) => isProgramStage(doc.verificationStage)).map((doc) => [doc.id, doc]),
  )
  // ⚠ By region, not by an id list: a whole-map scope's ids would overrun Postgres's bind limit.
  const windows = docs.length
    ? await loadSignupWindows({
        extraWhere: [
          scope.role === 'program'
            ? { event: { in: docs.map((doc) => doc.id) } }
            : { 'event.region': regionIds ? { in: [...regionIds] } : { exists: true } },
        ],
        now,
        req,
      })
    : new Map<number, { now: number; previous: number }>()
  let signupsNow = 0
  let signupsPrevious = 0
  for (const window of windows.values()) {
    signupsNow += window.now
    signupsPrevious += window.previous
  }
  // ⚠ Programs only, and this window only: a finished listing could put the
  // share above its denominator, and a quiet month's listing has no sign-up.
  const withSignups = [...windows].filter(([id, window]) => window.now > 0 && programs.has(id))
  const top = withSignups.reduce<(typeof withSignups)[number] | undefined>(
    (best, entry) => (!best || entry[1].now > best[1].now ? entry : best),
    undefined,
  )

  // A program manager's events are no region set, so the snapshot cannot say what they had.
  const programsBefore = scope.role !== 'program' && before ? countPrograms(before) : null
  return {
    health,
    analytics: [
      {
        key: 'programs',
        better: 'up',
        label: 'Total events',
        value: programs.size,
        change: programsBefore === null ? null : programs.size - programsBefore,
        path: listPath('events', [inScope, { verificationStage: { not_equals: 'finished' } }]),
      },
      {
        key: 'registrations',
        better: 'up',
        label: 'Registrations',
        value: signupsNow,
        change: signupsNow - signupsPrevious,
        ...(readsSubmissions && {
          path: listPath('user-submissions', [
            { type: { equals: 'registration' } },
            { createdAt: { greater_than: addDays(now, -WINDOW_DAYS).toISOString() } },
            ...(regionIds ? [{ 'event.region': { in: [...regionIds] } }] : []),
          ]),
        }),
      },
      {
        key: 'programs-with-signup',
        label: 'Events with a sign-up',
        value: withSignups.length,
        of: programs.size,
        change: null,
      },
    ],
    // Hidden for one program: naming the only listing as the busiest says nothing.
    mostRegistered:
      programs.size < 2 || !top
        ? null
        : {
            id: top[0],
            registrations: top[1].now,
            title: programs.get(top[0])!.title?.trim() || 'Untitled event',
          },
  }
}
