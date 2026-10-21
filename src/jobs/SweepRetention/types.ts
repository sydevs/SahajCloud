import type { CollectionSlug, PayloadRequest, Where } from 'payload'

/** One sweep: what to delete, and what to call it in the log. */
export interface PurgeWindow {
  days: number
  name: string
  where: (cutoff: string) => Where
}

/**
 * Called once per window, while the rows that window selects are still there.
 *
 * ⚠ Declared here rather than inline on `sweepCollection`, because an entry's
 * hook and the engine's parameter are the same contract. Spelled twice, a third
 * argument added on one side type-checks until somebody re-reads the task.
 */
export type BeforeDelete = (where: Where) => Promise<void>

/** Rows one entry deleted, as the task's per-collection output reports them. */
export interface RetentionCount {
  collection: string
  deleted: number
}

/** What one run of the task hands one entry's hooks. */
export interface RetentionRun {
  dryRun: boolean
  now: Date
  req: PayloadRequest
  windows: readonly PurgeWindow[]
}

/** The two hooks an entry may own. */
export interface RetentionHooks {
  /** Runs once the entry's windows are swept, and reports what it deleted itself. */
  afterDelete?: () => Promise<RetentionCount>
  beforeDelete?: BeforeDelete
}

/**
 * One collection's retention: its windows, and the hooks that go with them.
 *
 * ⚠ **`hooks` is a factory, called once per entry per run.** The
 * `user-submissions` pair shares a set of sender ids between them, and a set
 * held at module scope would carry one run's senders into the next — a dry
 * run's into the real sweep after it.
 */
export interface RetentionEntry {
  collection: CollectionSlug
  hooks?: (run: RetentionRun) => RetentionHooks
  windows: readonly PurgeWindow[]
}
