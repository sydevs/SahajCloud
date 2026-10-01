import type { PreparedCandidate } from '../resolve/duplicates'
import type { Endpoint, PayloadRequest, Where } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

import { parseBody, requireActiveManager } from '@/lib/endpoints'
import { geocodeLocation } from '@/lib/mapbox/geocoder'
import type { EventImport, EventImportRows, Region, SupportedTimezones } from '@/payload-types'
import { ownedRegionFilterOptions } from '@/plugins/access'

import { RESOLVE_CHUNK_ROWS } from '../constants'
import { cityKeyFor, findDuplicate, prepareCandidate } from '../resolve/duplicates'
import { geocodeRequestFor, resolveRow, type ResolvedRow } from '../resolve/resolveRow'
import { resolveTargetScope, type TargetChainNode, type TargetScope } from '../resolve/targetScope'

type ImportRow = EventImportRows[number]

/** A prepared class, plus how the review links back to it. */
interface Candidate extends PreparedCandidate {
  /** A class the CMS already holds. */
  eventId?: number
  /** An earlier line in this same file. */
  line?: number
}

/** The body carries nothing. It is still parsed, so a client sending something is told. */
const bodySchema = z.strictObject({}).optional()

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

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id)) return failure('A numeric batch id is required.', 400)

    const parsed = await parseBody(req, bodySchema)
    if (!parsed.ok) return parsed.response

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

    const scope = await loadTargetScope(req, targetId)
    if (!scope.ok) return failure(scope.error, 422)

    const rows = (batch.rows ?? []) as ImportRow[]
    const chunk = rows.filter(isPending).slice(0, RESOLVE_CHUNK_ROWS)
    if (!chunk.length) return Response.json({ ...tally(rows), pending: 0, done: true })

    // Rows an earlier chunk resolved are candidates too: a volunteer's file
    // repeats a class as readily as the CMS already holds one, and the match has
    // to be found whichever chunks the two landed in.
    const candidates: Candidate[] = [
      ...(await loadExistingCandidates(req, targetId)),
      ...rows.filter((row) => row.resolved).map(asCandidate),
    ]

    const defaultLanguages = (batch.defaultLanguages ?? []) as string[]
    for (const row of chunk) {
      await resolveOne({ row, scope: scope.scope, candidates, defaultLanguages })
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

    return Response.json({ ...tally(rows), pending, done: pending === 0 })
  },
}

interface ResolveOneArgs {
  row: ImportRow
  scope: TargetScope
  candidates: readonly Candidate[]
  defaultLanguages: string[]
}

/** Resolve one row in place, writing either its answers or its errors. */
async function resolveOne({
  row,
  scope,
  candidates,
  defaultLanguages,
}: ResolveOneArgs): Promise<void> {
  const values = row.values ?? {}
  const request = geocodeRequestFor(values, scope)
  if (request.kind === 'error') {
    row.errors = [...(row.errors ?? []), ...request.errors]
    return
  }

  const location = await geocodeLocation({
    query: request.query,
    types: request.types,
    countryCode: request.countryCode,
  })

  const result = resolveRow({ values, scope, location, defaultLanguages, todayIn })
  if (!result.ok) {
    row.errors = [...(row.errors ?? []), ...result.errors]
    return
  }

  row.resolved = result.resolved
  const match = findDuplicate(preparedFrom(result.resolved), candidates)
  if (!match) return

  const matched = candidates[match.index]!
  row.duplicate = {
    reason: match.reason,
    ...(matched.eventId === undefined ? {} : { eventId: matched.eventId }),
    ...(matched.line === undefined ? {} : { line: matched.line }),
  }
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
function preparedFrom(resolved: ResolvedRow): PreparedCandidate {
  return {
    cityKey: resolved.cityKey,
    point: { latitude: resolved.latitude, longitude: resolved.longitude },
    weekdayMask: resolved.weekdayMask,
    startMinutes: resolved.startMinutes,
  }
}

/** The same, carrying the line a reported match links back to. */
function asCandidate(row: ImportRow): Candidate {
  return { ...preparedFrom(row.resolved as ResolvedRow), line: row.line }
}

/**
 * 403 unless the caller may write inside the target's subtree.
 *
 * ⚠ **Asked of the database, not of a list in memory.** `ownedRegionFilterOptions`
 * is the same scoping `events.region` and `regions.parent` offer in the admin, so
 * an endpoint deciding it differently would be a second definition of who owns
 * what. `true` is the admin's answer — `requireActiveManager` has already turned
 * away everyone who is not an active manager.
 */
async function refuseUnownedTarget(
  req: PayloadRequest,
  targetId: number,
): Promise<Response | null> {
  const scoped = await ownedRegionFilterOptions({ req })
  if (scoped === true) return null
  if (scoped === false) return failure('You do not manage any region.', 403)

  const { totalDocs } = await req.payload.count({
    collection: 'regions',
    where: { and: [{ id: { equals: targetId } }, scoped] },
    overrideAccess: true,
    req,
  })
  return totalDocs ? null : failure('You do not manage that region.', 403)
}

type LoadScopeResult = { ok: true; scope: TargetScope } | { ok: false; error: string }

/**
 * The target's country and subdivision codes.
 *
 * The chain is read as its own query rather than through `depth: 1`: a
 * breadcrumb's `doc` would hydrate each whole region, and all this reads is
 * three fields off each ancestor.
 */
async function loadTargetScope(req: PayloadRequest, targetId: number): Promise<LoadScopeResult> {
  const target = (await req.payload.findByID({
    collection: 'regions',
    id: targetId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    select: { level: true, name: true, slug: true, breadcrumbs: true },
    req,
  })) as Region | null
  if (!target) return { ok: false, error: 'The target region no longer exists.' }

  // A region's own breadcrumbs include itself, so the target is filtered out of
  // the ancestor read and appended once below — it is already in hand.
  const ancestorIds = (target.breadcrumbs ?? [])
    .map((crumb) => relationId(crumb.doc))
    .filter((id): id is number => id !== null && id !== targetId)

  const ancestors = ancestorIds.length
    ? (
        await req.payload.find({
          collection: 'regions',
          where: { id: { in: ancestorIds } },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          select: { level: true, name: true, slug: true },
          req,
        })
      ).docs
    : []

  const chain: TargetChainNode[] = [...ancestors, target].map(({ level, name, slug }) => ({
    level,
    name,
    slug,
  }))
  const scope = resolveTargetScope(chain)
  return scope.ok ? { ok: true, scope: scope.scope } : { ok: false, error: scope.error }
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
    where: { region: { in: regionIds } },
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

/** A relationship's id, whether it arrived bare or hydrated. */
function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value) return Number(value.id)
  return null
}

function failure(message: string, status: number): Response {
  return Response.json({ errors: [{ message }] }, { status })
}
