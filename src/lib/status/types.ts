import type { BasePayload, PayloadRequest, TypedLocale } from 'payload'

/**
 * Stable identifier emitted by a compute function for a single readiness
 * check. The rendering layer joins it against `statusConfig.json` to
 * resolve a human-readable label/description.
 */
export type CheckResult = {
  key: string
  passed: boolean
}

/**
 * One row inside a `documents` group: a per-document set of checks.
 * The `label` is the document instance title (e.g. a lesson title); the
 * `id` is the document's primary key (or a sentinel string for "unset"
 * single-row groups).
 */
export type DocumentReport = {
  id: number | string
  label: string
  checks: CheckResult[]
}

/**
 * A group of checks of a single shape. Either:
 * - `documents`: a per-document list, each with its own checks; passes
 *   when every contained document passes every contained check.
 * - `aggregate`: a single threshold check (`actual >= threshold`).
 * - `errored`: the group's `evaluate` threw at runtime. Surfaced as a
 *   failing placeholder so one broken group doesn't sink the whole
 *   section read; the widget can render the `error` string.
 *
 * `optional: true` flags post-launch / nice-to-have groups — they are
 * excluded from the section's required `summary` and counted separately
 * in `optionalSummary`.
 */
export type ReadinessGroup =
  | {
      type: 'documents'
      key: string
      optional?: boolean
      documents: DocumentReport[]
      summary: { total: number; passing: number }
    }
  | {
      type: 'aggregate'
      key: string
      optional?: boolean
      passed: boolean
      actual: number
      threshold: number
      items?: Array<{ key: string; label: string; passed: boolean }>
    }
  | {
      type: 'errored'
      key: string
      optional?: boolean
      error: string
    }

/**
 * Per-section readiness output. Every group contributes `1/1` to its
 * section's `summary`; per-document totals stay inside each group's
 * own `summary`.
 */
export type ReadinessReport = {
  groups: ReadinessGroup[]
  summary: { total: number; passing: number }
  optionalSummary?: { total: number; passing: number }
}

/**
 * The signature every section's compute function exposes. Generic on the
 * per-project config shape — each project's status global defines its
 * own `TConfig` (e.g. WeMeditate App: `{ baselineCountry, launchCriticalAppCardIds }`).
 */
export type ComputeFn<TConfig> = (
  payload: BasePayload,
  locale: TypedLocale,
  config: TConfig,
  req?: PayloadRequest,
) => Promise<ReadinessReport>
