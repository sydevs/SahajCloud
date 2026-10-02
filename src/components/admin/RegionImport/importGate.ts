/**
 * Whether a region may be imported into, asked of the database.
 *
 * ⚠ **Separate from `ImportView` because the view imports `@payloadcms/ui`**, and
 * that pulls stylesheets no test runner outside the browser can load. The gate is
 * the half worth a spec, so it lives where a spec can reach it.
 */

import type { PayloadRequest } from 'payload'

import { OWNERSHIP_REFUSAL, targetOwnership } from '@/collections/EventImports/batchRequest'
import { mayStageImport, STAGE_IMPORT_REFUSAL } from '@/collections/EventImports/capability'
import {
  isProposableTargetLevel,
  unproposableTargetMessage,
} from '@/collections/EventImports/propose/tree'
import type { Region } from '@/payload-types'

/** The region a batch may target, or what the caller is told instead. */
export type ImportGate = { ok: false; refusal: string } | { ok: true; region: Region }

/**
 * Every refusal `POST /api/event-imports/upload` makes, in its order, so a reader
 * comparing the two reads one sequence — and so the capability is answered before
 * any region is read.
 *
 * Exported for `tests/int/event-import-tab.int.spec.ts`. The predicates have
 * their own specs; the wiring is what no pure spec can see, and this is the
 * feature's gate.
 */
export async function importGate({
  region,
  req,
}: {
  region: Region | null
  req: PayloadRequest
}): Promise<ImportGate> {
  if (!mayStageImport({ user: req.user, locale: req.locale })) {
    return { ok: false, refusal: STAGE_IMPORT_REFUSAL }
  }

  // The tab never shows before the first save, but the route is reachable by
  // hand, and a batch has to name a region that exists.
  if (!region?.id) return { ok: false, refusal: UNSAVED_REFUSAL }

  const ownership = await targetOwnership(req, region.id)
  if (ownership !== 'owned') return { ok: false, refusal: OWNERSHIP_REFUSAL[ownership] }

  if (!isProposableTargetLevel(region.level)) {
    return { ok: false, refusal: unproposableTargetMessage(region.level) }
  }

  return { ok: true, region }
}

export const UNSAVED_REFUSAL = 'Save this region before importing classes into it.'
