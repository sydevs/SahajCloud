/**
 * The job-stage contract: what a collection declares to put its Edit view
 * behind a worker, and the wait read off one stored document.
 *
 * Server-safe on purpose — no `'use client'`, and nothing imported but a type
 * guard that imports nothing itself. The view is a server component, and a
 * field component on the same collection may read the same declaration from
 * the browser, so a module either side can import must reach neither Payload's
 * server config nor its client bundle.
 */
import { isRecord } from '@/lib/utilities/isRecord'

/** A collection's `admin.custom.jobStage` declaration. */
export type JobStageConfig = {
  /**
   * Where the count rendered while waiting lives. Optional, because
   * `meditation-transcripts` publishes none and a waiting view with no number
   * is the ordinary case.
   */
  progressField?: string
  /** Statuses a worker holds the document in. */
  runningStages: string[]
  /** Where the stage lives. Defaults to `status`. */
  statusField?: string
}

/** The wait a document is in, while a worker holds it. */
export type JobStageWait = {
  progress: null | number
  stage: string
}

const DEFAULT_STATUS_FIELD = 'status'

/**
 * The declaration on a collection, or `null` when it declares none.
 *
 * `admin.custom` is `Record<string, any>` so that anything may extend it, so
 * every value here is checked rather than asserted. A collection declaring
 * `satisfies JobStageConfig` catches its own typo at build time; this is what
 * answers for a declaration that did not.
 */
export function readJobStageConfig(custom: unknown): JobStageConfig | null {
  if (!isRecord(custom)) return null
  const declared = custom.jobStage
  if (!isRecord(declared)) return null

  const { progressField, runningStages, statusField } = declared
  if (!Array.isArray(runningStages) || !runningStages.every((s) => typeof s === 'string')) {
    return null
  }

  return {
    progressField: typeof progressField === 'string' ? progressField : undefined,
    runningStages,
    statusField: typeof statusField === 'string' ? statusField : undefined,
  }
}

/**
 * The wait this document is in, or `null` when editing is the reader's.
 *
 * The stored stage is the whole input. Nothing polls, so a stage that settles
 * is one page load away rather than one refresh interval.
 */
export function jobStageWait(config: JobStageConfig, doc: unknown): JobStageWait | null {
  const stage = valueAt(doc, config.statusField ?? DEFAULT_STATUS_FIELD)
  if (typeof stage !== 'string' || !config.runningStages.includes(stage)) return null

  const progress = config.progressField ? valueAt(doc, config.progressField) : undefined
  return { progress: typeof progress === 'number' ? progress : null, stage }
}

/**
 * A dotted path, not a column name: a collection may keep its count inside a
 * group. #912's `event-imports` does — a `progress` group of `done`/`total` —
 * so a flat key would have given the view's first real count nothing to read.
 */
function valueAt(doc: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), doc)
}
