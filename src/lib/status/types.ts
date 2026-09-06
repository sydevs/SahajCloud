import type { BasePayload, PayloadRequest, TypedLocale } from 'payload'

import type { ReadinessReport } from '@/payload-types'

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
 * Threshold-capped "X of Y" header counter for a group. `documents`
 * groups count documents (passing / total); `aggregate` groups count
 * passing items capped at the threshold (`min(actual, threshold)` / threshold).
 */
export type GroupCounter = { current: number; total: number }

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
      /** Baked fact: every document passes every check (and there is ≥1 doc). */
      passing: boolean
      /** Baked header counter: documents passing / total. */
      counter: GroupCounter
    }
  | {
      type: 'aggregate'
      key: string
      optional?: boolean
      passed: boolean
      actual: number
      threshold: number
      items?: Array<{ id: string | number; label: string; checks: CheckResult[] }>
      /** Baked fact: `actual >= threshold`. */
      passing: boolean
      /** Baked header counter: min(actual, threshold) / threshold. */
      counter: GroupCounter
    }
  | {
      type: 'errored'
      key: string
      optional?: boolean
      error: string
      /** Baked fact: errored groups never pass. */
      passing: false
      /** Errored groups have no counter. */
      counter: null
    }

/** How an aggregate group's item rows are summarized in the table view. */
export type RowDisplay = 'all' | 'summarize-excess' | 'collapse-passing'

/** Kind of a row produced by `buildGroupView`, driving its styling. */
export type GroupRowKind = 'item' | 'missing' | 'summary'

/**
 * Link destination intent for a row — resolved to an admin URL by the view
 * layer (which holds the collection/global slugs + locale):
 * - `document`: the individual document editor.
 * - `list`: the collection list (a create destination); falls back to global.
 * - `global`: the backing global; falls back to the collection list.
 */
export type GroupRowLinkTarget = 'document' | 'list' | 'global'

/** A single pre-summarized table row, without any resolved URL or styling. */
export type GroupRow = {
  id: string | number
  label: string
  checks: CheckResult[]
  kind: GroupRowKind
  linkTarget: GroupRowLinkTarget
}

/** Pure view-model for a group's table: ordered check-key columns + rows. */
export type GroupView = { columns: string[]; rows: GroupRow[] }

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
