import type { PurgeWindow } from './sweepCollection'
import type { CollectionSlug, PayloadRequest, Where } from 'payload'

import { importsEntry } from './entries/imports'
import { payloadJobsEntry } from './entries/payloadJobs'
import { userSubmissionsEntry } from './entries/userSubmissions'

/** Rows one entry deleted, as the task's per-collection output reports them. */
export interface RetentionCount {
  collection: string
  deleted: number
}

/** What one run of the task hands an entry's hooks. */
export interface RetentionRun {
  dryRun: boolean
  now: Date
  req: PayloadRequest
}

/** The two hooks an entry may own. */
export interface RetentionHooks {
  /** Runs once the entry's windows are swept, and reports what it deleted itself. */
  afterDelete?: () => Promise<RetentionCount[]>
  /** Runs per window, while the rows that window selects are still there. */
  beforeDelete?: (window: PurgeWindow, where: Where) => Promise<void>
}

/**
 * One collection's retention: its windows, and the hooks that go with them.
 *
 * ⚠ **`hooks` is a factory, called once per run.** The `user-submissions` pair
 * shares a set of sender ids between them, and a set held at module scope would
 * carry one run's senders into the next — a dry run's into the real sweep after
 * it.
 */
export interface RetentionEntry {
  collection: CollectionSlug
  hooks?: (run: RetentionRun) => RetentionHooks
  windows: readonly PurgeWindow[]
}

/**
 * Every window sweep this app runs, one entry per collection.
 *
 * Adding a collection to retention is a row here plus a file beside this one,
 * rather than a task slug, an input schema, an output schema and a cron (#987).
 * Each entry's own file carries its windows and the reason each window is the
 * length it is.
 */
export const RETENTION_REGISTRY: readonly RetentionEntry[] = [
  userSubmissionsEntry,
  importsEntry,
  payloadJobsEntry,
]

/**
 * Collections deliberately left out, each with the reason. A collection in
 * neither list is an open question rather than a decision.
 *
 * `cleanupOrphanedMedia` is in neither on purpose: reference discovery across
 * every collection plus a two-phase trash is not a window sweep, and folding it
 * in would make an entry carry a second shape.
 */
export const NO_RETENTION: Record<string, string> = {
  // Whoever picks this window decides how long an orphan may outlive its parent.
  'meditation-transcripts':
    'No window chosen yet. A hard delete of a meditation nulls a transcript parent, and the orphan then keeps the full spoken word and its R2 key with nothing able to read it. How long that may last is a policy decision, not a refactor (#987).',
}
