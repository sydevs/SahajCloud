/**
 * The resolve job's first pass: one forward geocode per row with no answer yet.
 *
 * ⚠ **Concurrent, and that is why the duplicate check is not here.** A row is
 * compared against the rows before it (`./markDuplicates`), so matching inside
 * this pass would make a file's answers depend on which Mapbox request returned
 * first. Geocoding is the only part of the resolve that waits on a network, and
 * the only part worth running four at a time.
 *
 * ⚠ **A row's own fault is written onto the row; ours stops the pass.** "We
 * could not find this address" is the row's and stays on it. "Mapbox did not
 * answer" is ours, and writing it onto rows would turn a few minutes of trouble
 * into addresses a volunteer can only fix by re-uploading the file — so it
 * throws `GeocoderDown` and the rows that did resolve are kept.
 */

import type { PayloadRequest } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import pMap from 'p-map'

import type { RawImportRow } from '@/collections/EventImports/csv/columns'
import { jobWriteReq } from '@/collections/EventImports/jobContext'
import { geocodeRequestFor, resolveRow } from '@/collections/EventImports/resolve/resolveRow'
import type { TargetScope } from '@/collections/EventImports/resolve/targetScope'
import { geocodeLocation } from '@/lib/mapbox/geocoder'
import type { EventImportRows, SupportedTimezones } from '@/payload-types'


type ImportRow = EventImportRows[number]

/**
 * The geocoder could not be reached or is not configured — nothing to do with
 * any row.
 *
 * Its own class so the task can tell it from a programming error and store the
 * message for the volunteer before the queue retries.
 */
export class GeocoderDown extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeocoderDown'
  }
}

export interface GeocodeRowsArgs {
  req: PayloadRequest
  batchId: number
  /** Mutated in place: each row gains its answer or its reasons. */
  rows: ImportRow[]
  scope: TargetScope
  defaultLanguages: string[]
  concurrency: number
  /** How many rows between `progress` writes. */
  progressEvery: number
  todayIn: (timezone: SupportedTimezones) => Temporal.PlainDate
}

export async function geocodePendingRows({
  req,
  batchId,
  rows,
  scope,
  defaultLanguages,
  concurrency,
  progressEvery,
  todayIn,
}: GeocodeRowsArgs): Promise<void> {
  const pending = rows.filter(isPending)
  const total = rows.length
  let done = total - pending.length

  await writeProgress(req, batchId, { done, total, note: noteFor(done, total) })
  if (!pending.length) return

  let sinceWrite = 0
  await pMap(
    pending,
    async (row) => {
      await resolveOne({ row, scope, defaultLanguages, todayIn })
      done += 1
      sinceWrite += 1
      // Each write is a whole-document save, so one per row would re-serialise
      // the batch once per class for a bar nobody watches that closely.
      if (sinceWrite >= progressEvery) {
        sinceWrite = 0
        await writeProgress(req, batchId, { done, total, note: noteFor(done, total) })
      }
    },
    // `stopOnError` is the default, and the default is what we want: a
    // `GeocoderDown` must abandon the pass rather than ask Mapbox 499 more
    // times.
    { concurrency },
  )
}

/** A row is pending while it has neither an answer nor a reason it cannot have one. */
export function isPending(row: ImportRow): boolean {
  return !row.resolved && !row.errors?.length
}

interface ResolveOneArgs {
  row: ImportRow
  scope: TargetScope
  defaultLanguages: string[]
  todayIn: (timezone: SupportedTimezones) => Temporal.PlainDate
}

/** Resolve one row in place, writing either its answers or its errors. */
async function resolveOne({ row, scope, defaultLanguages, todayIn }: ResolveOneArgs): Promise<void> {
  const values = (row.values ?? {}) as RawImportRow
  const request = geocodeRequestFor(values, scope)
  if (request.kind === 'error') {
    row.errors = [...(row.errors ?? []), ...request.errors]
    return
  }

  const outcome = await geocodeLocation(request.query)
  if (outcome.status === 'unconfigured') {
    throw new GeocoderDown('Address lookup is not configured on this server. Ask an admin.')
  }
  if (outcome.status === 'unavailable') {
    throw new GeocoderDown('The address lookup service did not answer. This import will try again.')
  }
  if (outcome.status === 'refused') {
    row.errors = [
      ...(row.errors ?? []),
      `Mapbox could not look up this location (HTTP ${outcome.httpStatus}) — shorten or simplify the address and city`,
    ]
    return
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
    return
  }
  row.resolved = result.resolved
  if (result.warnings.length) row.warnings = [...(row.warnings ?? []), ...result.warnings]
}

function noteFor(done: number, total: number): string {
  return `Looking up ${total} ${total === 1 ? 'address' : 'addresses'} — ${done} done`
}

async function writeProgress(
  req: PayloadRequest,
  batchId: number,
  progress: { done: number; total: number; note: string },
): Promise<void> {
  await req.payload.update({
    collection: 'event-imports',
    id: batchId,
    data: { progress },
    overrideAccess: true,
    depth: 0,
    select: { status: true },
    req: jobWriteReq(req),
  })
}
