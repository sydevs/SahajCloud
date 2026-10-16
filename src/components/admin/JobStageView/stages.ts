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
  /**
   * How long a running stage may stand before the form opens anyway, in
   * milliseconds, measured against `updatedAt`. Nothing expires a stage, so
   * without this a run lost to a restart holds its row behind the waiting view
   * for good. Past it the editor gets the form back, and setting the status
   * column to its queued value is the retry.
   */
  staleAfterMs?: number
  /** Where the stage lives. Defaults to `status`. */
  statusField?: string
  /**
   * Where the denominator lives, for a job that knows one. Declared apart from
   * `progressField` rather than inferred from a group's shape, so the contract
   * names no consumer's key. Without it the view says "7 done so far" for a
   * job that knows it is 7 of 20.
   */
  totalField?: string
}

/** The wait a document is in, while a worker holds it. */
export type JobStageWait = {
  progress: null | number
  stage: string
  total: null | number
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

  const { progressField, runningStages, staleAfterMs, statusField, totalField } = declared
  if (!Array.isArray(runningStages) || !runningStages.every((s) => typeof s === 'string')) {
    return null
  }

  return {
    progressField: typeof progressField === 'string' ? progressField : undefined,
    runningStages,
    // A zero or negative window would open the form on every running row, so
    // an unusable number reads as undeclared rather than as "always stale".
    staleAfterMs:
      typeof staleAfterMs === 'number' && staleAfterMs > 0 ? staleAfterMs : undefined,
    statusField: typeof statusField === 'string' ? statusField : undefined,
    totalField: typeof totalField === 'string' ? totalField : undefined,
  }
}

/**
 * The wait this document is in, or `null` when editing is the reader's.
 *
 * The stored stage is the whole input. Nothing polls, so a stage that settles
 * is one page load away rather than one refresh interval.
 */
export function jobStageWait(
  config: JobStageConfig,
  doc: unknown,
  now: number = Date.now(),
): JobStageWait | null {
  const stage = valueAt(doc, config.statusField ?? DEFAULT_STATUS_FIELD)
  if (typeof stage !== 'string' || !config.runningStages.includes(stage)) return null
  if (isStale(config, doc, now)) return null

  return {
    progress: numberAt(doc, config.progressField),
    stage,
    total: numberAt(doc, config.totalField),
  }
}

/**
 * Whether a declared stall window has passed since the document was last
 * written, which releases the gate.
 *
 * An unreadable `updatedAt` keeps the wait: the alternative opens the form on
 * a healthy run whenever a timestamp cannot be parsed, which is the failure
 * the gate exists to prevent.
 */
function isStale(config: JobStageConfig, doc: unknown, now: number): boolean {
  if (config.staleAfterMs === undefined) return false
  const updatedAt = valueAt(doc, 'updatedAt')
  if (typeof updatedAt !== 'string') return false
  const written = Date.parse(updatedAt)
  return !Number.isNaN(written) && now - written > config.staleAfterMs
}

/** The number at a declared path, or `null` for an undeclared or unreadable one. */
function numberAt(doc: unknown, path: string | undefined): null | number {
  const value = path === undefined ? undefined : valueAt(doc, path)
  return typeof value === 'number' ? value : null
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
