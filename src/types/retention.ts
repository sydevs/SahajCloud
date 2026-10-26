import type { PayloadRequest, Where } from 'payload'

/**
 * The vocabulary a swept collection declares its retention in, read by
 * `cleanupCollections` off the built config (#987).
 *
 * Here rather than beside the job, because every swept collection's own config
 * declares one of these and nothing outside a job folder may import a job's
 * code (`src/AGENTS.md`). Discovery and the sweep itself live in
 * `src/jobs/CleanupCollections/`.
 */

/** One sweep: what to delete, and what to call it in the log. */
export interface PurgeWindow {
  days: number
  name: string
  where: (cutoff: string) => Where
}

/**
 * Called once per window, while the rows that window selects are still there.
 *
 * ⚠ Declared here rather than inline on `sweepCollection`, because a
 * collection's hook and the engine's parameter are the same contract. Spelled
 * twice, a third argument added on one side type-checks until somebody
 * re-reads the task.
 */
export type BeforeDelete = (where: Where) => Promise<void>

/** Rows one collection lost, as the task's per-collection output reports them. */
export interface RetentionCount {
  collection: string
  deleted: number
}

/**
 * What one run of the sweep hands one collection's hooks.
 *
 * ⚠ **`wheres` are already resolved against the run's clock**, so a hook asks
 * what this run is about to delete rather than recomputing it from the windows
 * and a date. Handed the windows instead, the orphan sweep re-derived its
 * cutoffs and a drifted clock would have given the two halves different
 * answers.
 */
export interface RetentionRun {
  dryRun: boolean
  req: PayloadRequest
  wheres: readonly Where[]
}

/** The two hooks a collection's retention may own. */
export interface RetentionHooks {
  /** Runs once the windows are swept, and reports what it deleted itself. */
  afterDelete?: () => Promise<RetentionCount>
  beforeDelete?: BeforeDelete
}

/**
 * One collection's retention, as it declares it on `custom.retention` (#987).
 *
 * ⚠ **`hooks` is a factory, called once per collection per run.** The
 * `user-submissions` pair shares a set of sender ids between them, and a set
 * held at module scope would carry one run's senders into the next — a dry
 * run's into the real sweep after it.
 */
export interface RetentionConfig {
  hooks?: (run: RetentionRun) => RetentionHooks
  windows: readonly PurgeWindow[]
}
