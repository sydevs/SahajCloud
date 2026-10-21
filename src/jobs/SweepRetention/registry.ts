import type { RetentionEntry } from './types'
import type { CollectionSlug } from 'payload'

import { importsEntry } from './entries/imports'
import { payloadJobsEntry } from './entries/payloadJobs'
import { userSubmissionsEntry } from './entries/userSubmissions'

/**
 * Every window sweep this app runs, one entry per collection it ages.
 *
 * Adding a collection to retention is a row here plus a file under `entries/`,
 * rather than a task slug, an input schema, an output schema and a cron (#987).
 * Each entry's own file carries its windows and the reason each window is the
 * length it is.
 *
 * ⚠ **A collection the task reports is not always a row here.** `users` is
 * swept through the `user-submissions` entry's `hooks`: an orphan ages nothing
 * of its own, going when its last referencing submission goes, and every entry
 * owes a window.
 *
 * ⚠ **The order is what the task reports in**, so it is the order
 * `tests/int/retention-jobs.int.spec.ts` reads back.
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
 *
 * ⚠ Keyed on `CollectionSlug`, so a renamed collection cannot sit here
 * misspelled while reading as a settled decision.
 */
export const NO_RETENTION: Partial<Record<CollectionSlug, string>> = {
  // Whoever picks this window decides how long an orphan may outlive its parent.
  'meditation-transcripts':
    'No window chosen yet. A hard delete of a meditation nulls a transcript parent, and the orphan then keeps the full spoken word and its R2 key with nothing able to read it. How long that may last is a policy decision, not a refactor (#987).',
}
