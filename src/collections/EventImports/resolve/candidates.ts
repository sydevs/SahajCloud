/**
 * The classes a row is compared against, as both the resolve step and the
 * commit read them.
 *
 * ⚠ **One reading, because the commit asks the question again.** The resolve
 * step finds the duplicates a reviewer decides on; the commit re-asks it of every
 * row it is about to write, against classes added since — another volunteer's
 * batch into the same region, or this same file uploaded twice. Two readings of
 * "the classes already here" would be two answers to whether a row repeats one.
 */

import type { PreparedCandidate } from './duplicates'
import type { ResolvedRow } from './resolveRow'
import type { RawImportRow } from '../csv/columns'
import type { PayloadRequest, Where } from 'payload'

import { notFinishedWhere } from '@/collections/Events/lifecycle/finished'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImportRows, Region } from '@/payload-types'

import { targetSubtreeWhere } from '../subtree'
import { cityKeyFor, prepareCandidate } from './duplicates'

/** A prepared class, plus how the review links back to it. */
export interface Candidate extends PreparedCandidate {
  /** A class the CMS already holds. */
  eventId?: number
  /** An earlier line in this same file. */
  line?: number
}

/**
 * A resolved row as a comparison reads it.
 *
 * The schedule key was derived when the row resolved, so this rebuilds no
 * schedule — which is the point of storing it: a row from an earlier chunk stays
 * comparable without re-running the mapper over the batch.
 */
export function preparedFrom(resolved: ResolvedRow, values: RawImportRow): PreparedCandidate {
  const online = values.eventType === 'online'
  return {
    cityKey: resolved.cityKey,
    // ⚠ **An online row's coordinates are its town's centroid, shared by every
    // online row there**, and an approximate geocode's are a street's or a
    // town's — neither is a hall, so neither may satisfy the nearby-address
    // rule. A stored online event has no address either, so the sides agree.
    point:
      online || resolved.approximate
        ? null
        : { latitude: resolved.latitude, longitude: resolved.longitude },
    online,
    inactive: resolved.inactive,
    weekdayMask: resolved.weekdayMask,
    startMinutes: resolved.startMinutes,
    firstDay: resolved.firstDay,
    lastDay: resolved.lastDay,
    monthWeeks: resolved.monthWeeks,
    monthDay: resolved.monthDay,
  }
}

/** The same, carrying the line a reported match links back to. */
export function asCandidate(row: EventImportRows[number]): Candidate {
  return {
    ...preparedFrom(row.resolved as ResolvedRow, (row.values ?? {}) as RawImportRow),
    line: row.line,
  }
}

/**
 * Every non-trashed, unfinished class already in the target's subtree, reduced
 * once.
 *
 * ⚠ **`exceptBatch` leaves out this batch's own classes**, which the commit must
 * not report as duplicates of the rows that created them. They carry an
 * `importKey` of `<batch>:<line>` (`commit/rows.ts`).
 *
 * ⚠ **An online class has no address, so its town comes from its region.** The
 * row side names its town from the geocode's `place`; the stored side's region
 * is that town (or a hall in it), which is what makes re-uploading a file of
 * online classes find them rather than create every one again.
 *
 * ⚠ **The `select` is what keeps this one query.** A `depth: 0` read still runs
 * every field's `afterRead` per row, and `events` carries a virtual quality
 * report and a join — `docs/rules/endpoints.md` names this the virtual-field
 * N+1.
 */
export async function loadExistingCandidates(
  req: PayloadRequest,
  targetId: number,
  { exceptBatch }: { exceptBatch?: number } = {},
): Promise<Candidate[]> {
  const regions = await req.payload.find({
    collection: 'regions',
    where: targetSubtreeWhere(targetId),
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { level: true, name: true, slug: true, parent: true },
    req,
  })
  const byId = new Map((regions.docs as Region[]).map((region) => [region.id, region]))
  if (!byId.size) return []

  const where: Where[] = [{ region: { in: [...byId.keys()] } }, notFinishedWhere(new Date())]
  const ownPrefix = exceptBatch === undefined ? null : `${exceptBatch}:`

  const events = await req.payload.find({
    collection: 'events',
    // ⚠ `excludeFinishedEvents` only fires for an API client, so a manager's
    // read sees every expired series — and a dead Tuesday class at the same hall
    // would swallow the row re-importing this year's timetable.
    where: { and: where },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: {
      address: true,
      schedule: true,
      inactive: true,
      eventType: true,
      region: true,
      importKey: true,
    },
    req,
  })

  // Filtered here rather than in the `where`: Payload's `like` is a contains
  // match, so `12:` would also leave out batch 112's classes.
  const others = ownPrefix
    ? events.docs.filter((event) => !event.importKey?.startsWith(ownPrefix))
    : events.docs

  return others.map((event) => {
    const online = event.eventType === 'online'
    return {
      ...prepareCandidate({
        cityKey:
          cityKeyFor(event.address?.city) ?? cityKeyFor(townOf(relationId(event.region), byId)),
        point: online ? null : pointOf(event.address),
        online,
        schedule: event.inactive || !event.schedule ? null : event.schedule,
      }),
      eventId: event.id,
    }
  })
}

/** The town a class is filed under: its region, or the city above its hall. */
function townOf(regionId: null | number, byId: ReadonlyMap<number, Region>): null | string {
  const region = regionId === null ? undefined : byId.get(regionId)
  if (!region) return null
  if (region.level === 'venue') {
    const parent = byId.get(relationId(region.parent) ?? -1)
    return parent?.name?.trim() || parent?.slug || null
  }
  return region.name?.trim() || region.slug || null
}

function pointOf(
  address: { latitude?: number | null; longitude?: number | null } | null | undefined,
): { latitude: number; longitude: number } | null {
  const { latitude, longitude } = address ?? {}
  return latitude != null && longitude != null ? { latitude, longitude } : null
}
