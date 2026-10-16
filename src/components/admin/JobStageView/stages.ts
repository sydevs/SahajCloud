/**
 * The job-stage contract: what a collection declares to put its Edit view
 * behind a worker, and the decision read off one stored document.
 *
 * Server-safe on purpose — no `'use client'`, no React, no import. The view is
 * a server component, and a field component on the same collection may read
 * the same declaration from the browser, so a module either side can import
 * must reach neither Payload's server config nor its client bundle.
 */

/** A collection's `admin.custom.jobStage` declaration. */
export type JobStageConfig = {
  /**
   * Column holding the count rendered while waiting. Optional: a collection
   * whose worker publishes no count is the ordinary case, not a
   * misconfiguration.
   */
  progressField?: string
  /** Statuses a worker holds the document in. */
  runningStages: string[]
  /** Column holding the stage. Defaults to `status`. */
  statusField?: string
}

/** What the stored document says about whose turn it is. */
export type JobStageDecision =
  | { progress: null | number; stage: string; waiting: true }
  | { waiting: false }

export const DEFAULT_STATUS_FIELD = 'status'

/**
 * The declaration on a collection, or `null` when it declares none.
 *
 * `admin.custom` is `Record<string, any>` so that anything may extend it, so
 * every value here is checked rather than asserted — nothing validates a
 * collection's declaration on the way in.
 */
export function readJobStageConfig(custom: unknown): JobStageConfig | null {
  if (typeof custom !== 'object' || custom === null) return null
  const declared = (custom as { jobStage?: unknown }).jobStage
  if (typeof declared !== 'object' || declared === null) return null

  const { progressField, runningStages, statusField } = declared as Record<string, unknown>
  if (!Array.isArray(runningStages) || !runningStages.every((s) => typeof s === 'string')) {
    return null
  }

  return {
    ...(typeof progressField === 'string' ? { progressField } : {}),
    runningStages,
    ...(typeof statusField === 'string' ? { statusField } : {}),
  }
}

/**
 * Whether a worker holds this document, and the count to show while it does.
 *
 * The stored stage is the whole input. Nothing polls, so a stage that settles
 * is one page load away rather than one refresh interval.
 */
export function decideJobStage(
  config: JobStageConfig,
  doc: null | Record<string, unknown> | undefined,
): JobStageDecision {
  const stage = doc?.[config.statusField ?? DEFAULT_STATUS_FIELD]
  if (typeof stage !== 'string' || !config.runningStages.includes(stage)) {
    return { waiting: false }
  }

  const progress = config.progressField ? doc?.[config.progressField] : undefined
  return { progress: typeof progress === 'number' ? progress : null, stage, waiting: true }
}
