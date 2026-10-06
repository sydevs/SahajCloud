import type { RawImportRow } from '../csv/columns'
import type { TargetScope } from '../resolve/targetScope'
import type { Endpoint } from 'payload'

import { Temporal } from '@js-temporal/polyfill'

import { requireActiveManager } from '@/lib/endpoints'
import { geocodeLocation } from '@/lib/mapbox/geocoder'
import { relationId } from '@/lib/utilities/relationId'
import type { EventImport, EventImportRows, SupportedTimezones } from '@/payload-types'

import {
  batchIdOf,
  failure,
  loadTarget,
  refuseRevokedRole,
  refuseUnownedTarget,
} from '../batchRequest'
import { RESOLVE_CHUNK_ROWS, RESOLVE_TIME_BUDGET_MS } from '../constants'
import { busy, renewLease, withLease } from '../lease'
import {
  asCandidate,
  loadExistingCandidates,
  preparedFrom,
  type Candidate,
} from '../resolve/candidates'
import { findDuplicate } from '../resolve/duplicates'
import { geocodeRequestFor, resolveRow } from '../resolve/resolveRow'

type ImportRow = EventImportRows[number]

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
 * ⚠ **One request at a time, and each one bounded in time.** A chunk holds the
 * batch's lease (`lease.ts`) and stops geocoding when `RESOLVE_TIME_BUDGET_MS`
 * runs out. Without both, a slow chunk the proxy cut kept running, a Resume
 * started a second, and whichever wrote last put back a copy of the rows from
 * before the other — rows reverted to pending under a batch already marked
 * `resolved`, which the commit then silently left out.
 *
 * ⚠ **The role is asked again, not inferred from the batch existing.** Ownership
 * of the target is document-manager access and outlives a revoked role
 * (`refuseRevokedRole`).
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

    const probe = (await req.payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: false,
      disableErrors: true,
      select: { targetRegion: true, uploadLocale: true },
      req,
    })) as EventImport | null
    if (!probe) return failure('No such import batch.', 404)

    const revoked = refuseRevokedRole(req, probe)
    if (revoked) return revoked

    const targetId = relationId(probe.targetRegion)
    if (targetId === null) return failure('This batch names no target region.', 409)

    const unowned = await refuseUnownedTarget(req, targetId)
    if (unowned) return unowned

    const scope = await loadTarget(req, targetId)
    if (!scope.ok) return failure(scope.error, 422)
    const warn = scope.warning ? { warning: scope.warning } : {}

    return withLease(req, id, async (token) => {
      const batch = (await req.payload.findByID({
        collection: 'event-imports',
        id,
        depth: 0,
        overrideAccess: true,
        select: { status: true, rows: true, defaultLanguages: true },
        req,
      })) as EventImport
      if (batch.status === 'committing' || batch.status === 'finished') {
        return failure('This batch is being committed, so its rows can no longer change.', 409)
      }

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
            select: { status: true },
            req,
          })
        }
        return Response.json({ ...tally(rows), ...warn, pending: 0, done: true })
      }

      // Rows an earlier chunk resolved are candidates too: a volunteer's file
      // repeats a class as readily as the CMS already holds one, and the match
      // has to be found whichever chunks the two landed in.
      const candidates: Candidate[] = [
        ...(await loadExistingCandidates(req, targetId)),
        ...rows.filter((row) => row.resolved).map(asCandidate),
      ]

      const defaultLanguages = (batch.defaultLanguages ?? []) as string[]
      const deadline = Date.now() + RESOLVE_TIME_BUDGET_MS
      let stopped: null | string = null
      for (const row of chunk) {
        // At least one row per call, so a budget spent on one slow geocode
        // still moves the batch forward.
        if (row !== chunk[0] && Date.now() > deadline) break
        let outcome: ResolveOutcome
        try {
          outcome = await resolveOne({ row, scope: scope.scope, candidates, defaultLanguages })
        } catch (error) {
          // Nothing here is the row's fault, so the row stays pending and what
          // already resolved is still written below.
          req.payload.logger.error(
            { err: error, batch: id, line: row.line },
            'Import row not resolved',
          )
          stopped = 'A row could not be resolved; try again shortly.'
          break
        }
        if (outcome !== 'done') {
          // ⚠ **Stop, and leave the rest of the chunk pending.** Mapbox not
          // answering says nothing about the row, so writing "could not find
          // this location" on it would turn a few minutes of trouble into
          // addresses a volunteer can only fix by re-uploading the file.
          stopped =
            outcome === 'unconfigured'
              ? 'Geocoding is not configured on this server. Ask an admin.'
              : 'Geocoding is unavailable; try again shortly.'
          break
        }
        if (row.resolved) candidates.push(asCandidate(row))
      }

      const pending = rows.filter(isPending).length
      if (!(await renewLease(req, id, token))) return busy()
      await req.payload.update({
        collection: 'event-imports',
        id,
        data: {
          rows,
          // The commit step requires `resolved`, so the status moves only once
          // no row is still waiting for an answer.
          ...(pending ? {} : { status: 'resolved' as const }),
        },
        // The caller's ownership was settled above, and `rows` is `readOnly` in
        // the admin — so this write elevates past field access deliberately.
        overrideAccess: true,
        depth: 0,
        select: { status: true },
        req,
      })

      const body = { ...tally(rows), ...warn, pending, done: pending === 0 }
      return stopped
        ? Response.json({ ...body, errors: [{ message: stopped }] }, { status: 503 })
        : Response.json(body)
    })
  },
}

interface ResolveOneArgs {
  row: ImportRow
  scope: TargetScope
  candidates: readonly Candidate[]
  defaultLanguages: string[]
}

/** `done` once the row holds an answer or its reasons; otherwise why the chunk must stop. */
type ResolveOutcome = 'done' | 'unavailable' | 'unconfigured'

/**
 * Resolve one row in place, writing either its answers or its errors.
 *
 * Anything but `done` is about us rather than the row — the geocoder could not
 * be reached, or is not configured — so the row is left untouched and pending.
 */
async function resolveOne({
  row,
  scope,
  candidates,
  defaultLanguages,
}: ResolveOneArgs): Promise<ResolveOutcome> {
  const values = (row.values ?? {}) as RawImportRow
  const request = geocodeRequestFor(values, scope)
  if (request.kind === 'error') {
    row.errors = [...(row.errors ?? []), ...request.errors]
    return 'done'
  }

  const outcome = await geocodeLocation({
    query: request.query,
    types: request.types,
    countryCode: request.countryCode,
  })
  if (outcome.status === 'unavailable') return 'unavailable'
  if (outcome.status === 'unconfigured') return 'unconfigured'
  if (outcome.status === 'refused') {
    row.errors = [
      ...(row.errors ?? []),
      `Mapbox could not look up this location (HTTP ${outcome.httpStatus}) — shorten or simplify the address and city`,
    ]
    return 'done'
  }

  const result = resolveRow({
    values,
    scope,
    location: outcome.status === 'found' ? outcome.location : null,
    defaultLanguages,
    todayIn,
  })
  if (!result.ok) {
    row.errors = [...(row.errors ?? []), ...result.errors]
    return 'done'
  }

  row.resolved = result.resolved
  if (result.warnings.length) row.warnings = [...(row.warnings ?? []), ...result.warnings]
  const match = findDuplicate(preparedFrom(result.resolved, values), candidates)
  if (!match) return 'done'

  const matched = candidates[match.index]!
  row.duplicate = {
    reason: match.reason,
    strength: match.strength,
    ...(matched.eventId === undefined ? {} : { eventId: matched.eventId }),
    ...(matched.line === undefined ? {} : { line: matched.line }),
  }
  return 'done'
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
