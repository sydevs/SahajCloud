import type { RawImportRow } from '../csv/columns'
import type { PreparedCandidate } from '../resolve/duplicates'
import type { TargetScope } from '../resolve/targetScope'
import type { Endpoint, PayloadRequest, Where } from 'payload'

import { Temporal } from '@js-temporal/polyfill'

import { notFinishedWhere } from '@/collections/Events/lifecycle/finished'
import { requireActiveManager } from '@/lib/endpoints'
import { geocodeLocation } from '@/lib/mapbox/geocoder'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImport, EventImportRows, SupportedTimezones } from '@/payload-types'

import { batchIdOf, failure, loadTarget, refuseUnownedTarget } from '../batchRequest'
import { RESOLVE_CHUNK_ROWS } from '../constants'
import { cityKeyFor, findDuplicate, prepareCandidate } from '../resolve/duplicates'
import { geocodeRequestFor, resolveRow, type ResolvedRow } from '../resolve/resolveRow'

type ImportRow = EventImportRows[number]

/** A prepared class, plus how the review links back to it. */
interface Candidate extends PreparedCandidate {
  /** A class the CMS already holds. */
  eventId?: number
  /** An earlier line in this same file. */
  line?: number
}

/**
 * POST /api/event-imports/:id/resolve
 *
 * Geocodes the next chunk of a batch's rows, places each against the target
 * region, flags the ones that repeat a class, and writes the answers back. The
 * review UI calls it until the response says `done`.
 *
 * ⚠ **Chunked because the work is per row and it talks to Mapbox.** A 500-row
 * batch is 500 forward geocodes with a retry each, which no one request can hold
 * open. Each call takes the next rows that have no answer yet, so a dropped
 * response costs one chunk and a re-call resumes — there is no cursor for a
 * client to get wrong, and calling it twice over costs nothing.
 *
 * ⚠ **The gate is document ownership, not role.** A caller reaches this with
 * (active manager) AND (the batch is theirs) AND (the target is in their region
 * subtree); it never asks whether they hold the `events: create` authority the
 * import ends up exercising, because `resolveManagedDocIds` answers ownership
 * and not role. Nothing can exploit that today — `create` on `event-imports` is
 * admins-only, so a non-atlas manager only ever holds a batch an admin made for
 * them — but the upload endpoint is where the role check has to land.
 *
 * Auth: intentionally NOT `requireActiveClient`. That guard serves published API
 * `clients`; this is an admin-panel action by an authenticated `manager` on a
 * batch they uploaded, reached only from a region's Import tab. `managers` sits
 * in no project and publishes no paths, so this is absent from the OpenAPI
 * client spec for the same reason `setProject` is. Which batch the caller may
 * touch comes from the collection's own `access` (`access.ts`); the subtree
 * check below is re-run explicitly because every write that follows elevates
 * past access.
 */
export const resolveEventImport: Endpoint = {
  path: '/:id/resolve',
  method: 'post',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = batchIdOf(req)
    if (id === null) return failure('A numeric batch id is required.', 400)

    const batch = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      req,
    })) as EventImport | null
    if (!batch) return failure('No such import batch.', 404)
    if (batch.status === 'committing') {
      return failure('This batch is being committed, so its rows can no longer change.', 409)
    }

    const targetId = relationId(batch.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const scope = await loadTarget(req, targetId)
    if (!scope.ok) return failure(scope.error, 422)

    const warn = scope.warning ? { warning: scope.warning } : {}
    const rows = (batch.rows ?? []) as ImportRow[]
    const chunk = rows.filter(isPending).slice(0, RESOLVE_CHUNK_ROWS)
    if (!chunk.length) {
      // ⚠ The status is written here too, not only on the path that resolved
      // something. A file whose every row failed the parse has nothing pending
      // from the first call, and would otherwise report `done` forever while
      // staying `uploaded` — which the commit step refuses.
      if (batch.status !== 'resolved') {
        await req.payload.update({
          collection: 'event-imports',
          id,
          data: { status: 'resolved' },
          overrideAccess: true,
          depth: 0,
          req,
        })
      }
      return Response.json({ ...tally(rows), ...warn, pending: 0, done: true })
    }

    // Rows an earlier chunk resolved are candidates too: a volunteer's file
    // repeats a class as readily as the CMS already holds one, and the match has
    // to be found whichever chunks the two landed in.
    const candidates: Candidate[] = [
      ...(await loadExistingCandidates(req, targetId)),
      ...rows.filter((row) => row.resolved).map(asCandidate),
    ]

    const defaultLanguages = (batch.defaultLanguages ?? []) as string[]
    let unavailable = false
    for (const row of chunk) {
      const placed = await resolveOne({ row, scope: scope.scope, candidates, defaultLanguages })
      if (!placed) {
        // ⚠ **Stop, and leave the rest of the chunk pending.** Mapbox not
        // answering says nothing about the row, so writing "could not find this
        // location" on it would turn a few minutes of trouble into addresses a
        // volunteer can only fix by re-uploading the file. What already resolved
        // is still written, so the next call resumes rather than restarts.
        unavailable = true
        break
      }
      if (row.resolved) candidates.push(asCandidate(row))
    }

    const pending = rows.filter(isPending).length
    await req.payload.update({
      collection: 'event-imports',
      id,
      data: {
        rows,
        // The commit step requires `resolved`, so the status moves only once no
        // row is still waiting for an answer.
        ...(pending ? {} : { status: 'resolved' as const }),
      },
      // The caller's ownership was settled above, and `rows` is `readOnly` in
      // the admin — so this write elevates past field access deliberately.
      overrideAccess: true,
      depth: 0,
      req,
    })

    const body = { ...tally(rows), ...warn, pending, done: pending === 0 }
    return unavailable
      ? Response.json(
          { ...body, errors: [{ message: 'Geocoding is unavailable; try again shortly.' }] },
          { status: 503 },
        )
      : Response.json(body)
  },
}

interface ResolveOneArgs {
  row: ImportRow
  scope: TargetScope
  candidates: readonly Candidate[]
  defaultLanguages: string[]
}

/**
 * Resolve one row in place, writing either its answers or its errors.
 *
 * Returns false when the geocoder could not be reached — the one outcome that is
 * about us rather than the row, so the row is left untouched and pending.
 */
async function resolveOne({
  row,
  scope,
  candidates,
  defaultLanguages,
}: ResolveOneArgs): Promise<boolean> {
  const values = row.values ?? {}
  const request = geocodeRequestFor(values, scope)
  if (request.kind === 'error') {
    row.errors = [...(row.errors ?? []), ...request.errors]
    return true
  }

  const outcome = await geocodeLocation({
    query: request.query,
    types: request.types,
    countryCode: request.countryCode,
  })
  if (outcome.status === 'unavailable') return false

  const result = resolveRow({
    values,
    scope,
    location: outcome.status === 'found' ? outcome.location : null,
    defaultLanguages,
    todayIn,
  })
  if (!result.ok) {
    row.errors = [...(row.errors ?? []), ...result.errors]
    return true
  }

  row.resolved = result.resolved
  const match = findDuplicate(preparedFrom(result.resolved, values), candidates)
  if (!match) return true

  const matched = candidates[match.index]!
  row.duplicate = {
    reason: match.reason,
    ...(matched.eventId === undefined ? {} : { eventId: matched.eventId }),
    ...(matched.line === undefined ? {} : { line: matched.line }),
  }
  return true
}

/** A row is pending while it has neither an answer nor a reason it cannot have one. */
function isPending(row: ImportRow): boolean {
  return !row.resolved && !row.errors?.length
}

interface Tally {
  total: number
  resolved: number
  duplicates: number
  errors: number
}

/** What the review banner counts, recomputed from the rows rather than tracked. */
function tally(rows: readonly ImportRow[]): Tally {
  return {
    total: rows.length,
    resolved: rows.filter((row) => row.resolved && !row.duplicate).length,
    duplicates: rows.filter((row) => row.duplicate).length,
    errors: rows.filter((row) => row.errors?.length).length,
  }
}

/** Today in the class's own zone — what "the next matching day" counts from. */
function todayIn(timezone: SupportedTimezones): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(timezone)
}

/**
 * A resolved row as a comparison reads it.
 *
 * The weekday mask and start minute were derived when the row resolved, so this
 * rebuilds no schedule — which is the point of storing them: a row from an
 * earlier chunk stays comparable without re-running the mapper over the batch.
 */
function preparedFrom(resolved: ResolvedRow, values: RawImportRow): PreparedCandidate {
  return {
    cityKey: resolved.cityKey,
    // ⚠ **An online row has no address, so it must carry no point.** Its
    // coordinates are the city's centroid, shared by every online row in that
    // city — and `nearby-address` is checked before the time rule, so a point
    // here would merge a 18:00 and a 20:00 online class into one. Without it
    // they fall through to city-and-time, which is the right question for a
    // class with no hall. A stored online event has no address either, so the
    // two sides stay symmetric.
    point:
      values.eventType === 'online'
        ? null
        : { latitude: resolved.latitude, longitude: resolved.longitude },
    weekdayMask: resolved.weekdayMask,
    startMinutes: resolved.startMinutes,
  }
}

/** The same, carrying the line a reported match links back to. */
function asCandidate(row: ImportRow): Candidate {
  return { ...preparedFrom(row.resolved as ResolvedRow, row.values ?? {}), line: row.line }
}

/**
 * Every non-trashed class already in the target's subtree, reduced once.
 *
 * ⚠ **The `select` is what keeps this one query.** A `depth: 0` read still runs
 * every field's `afterRead` per row, and `events` carries a virtual quality
 * report and a join — `docs/rules/endpoints.md` names this the virtual-field
 * N+1. Trashed rows are left out by Payload's own default filter, which is the
 * rule here: a discarded listing is not a class a row repeats.
 */
async function loadExistingCandidates(req: PayloadRequest, targetId: number): Promise<Candidate[]> {
  const subtree: Where = {
    or: [{ id: { equals: targetId } }, { 'breadcrumbs.doc': { equals: targetId } }],
  }
  const regions = await req.payload.find({
    collection: 'regions',
    where: subtree,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    // `id` always comes back; `level` is the cheapest column to ask for, and an
    // include-mode select is what stops every region's own `afterRead` running.
    select: { level: true },
    req,
  })
  const regionIds = regions.docs.map((region) => region.id)
  if (!regionIds.length) return []

  const events = await req.payload.find({
    collection: 'events',
    // ⚠ `excludeFinishedEvents` only fires for an API client, so a manager's
    // read sees every expired series — and a dead Tuesday class at the same hall
    // would swallow the row re-importing this year's timetable.
    where: { and: [{ region: { in: regionIds } }, notFinishedWhere(new Date())] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { address: true, schedule: true, inactive: true },
    req,
  })

  return events.docs.map((event) => ({
    ...prepareCandidate({
      cityKey: cityKeyFor(event.address?.city),
      point: pointOf(event.address),
      schedule: event.inactive || !event.schedule ? null : event.schedule,
    }),
    eventId: event.id,
  }))
}

function pointOf(
  address: { latitude?: number | null; longitude?: number | null } | null | undefined,
): { latitude: number; longitude: number } | null {
  const { latitude, longitude } = address ?? {}
  return latitude != null && longitude != null ? { latitude, longitude } : null
}
