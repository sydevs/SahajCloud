import type { DocumentReport } from './types'
import type { BasePayload, Field, PayloadRequest, TypedLocale } from 'payload'

/**
 * Per-request context handed to every section's `prepare` and to every
 * group `evaluate` callback. Carries the runtime values the compute
 * layer would otherwise have to grab from somewhere else.
 */
export interface ProjectRequestContext<TConfig> {
  payload: BasePayload
  locale: TypedLocale
  config: TConfig
  req?: PayloadRequest
}

/**
 * Display metadata for one stable check key. Read by the generator
 * script and serialized into `statusConfig.json` for the admin widget.
 */
export interface CheckMetadata {
  label: string
  description: string
}

interface BaseGroupSpec {
  /** Stable identifier — must be unique within a section. */
  key: string
  label: string
  description: string
  /** When true, excluded from required `summary`, counted in `optionalSummary`. */
  optional?: boolean
}

export interface DocumentsGroupSpec<TSectionCtx, TConfig> extends BaseGroupSpec {
  type: 'documents'
  /**
   * Returns one row per document — each row carries inline `{ key, passed }`
   * check results whose `key` must appear in the parent section's `checks` map.
   */
  evaluate: (
    sectionCtx: TSectionCtx,
    req: ProjectRequestContext<TConfig>,
  ) => Promise<DocumentReport[]>
}

export interface AggregateGroupSpec<TSectionCtx, TConfig> extends BaseGroupSpec {
  type: 'aggregate'
  threshold: number
  /** Returns `actual`. The runner compares against `threshold`. */
  evaluate: (sectionCtx: TSectionCtx, req: ProjectRequestContext<TConfig>) => Promise<number>
}

export type GroupSpec<TSectionCtx, TConfig> =
  | DocumentsGroupSpec<TSectionCtx, TConfig>
  | AggregateGroupSpec<TSectionCtx, TConfig>

/**
 * One section of the status global — corresponds to a single virtual
 * JSON field. Carries its own metadata + a list of groups + an optional
 * shared `prepare` step that runs once before the groups.
 */
export interface SectionSpec<TConfig, TSectionCtx = void> {
  /** Top-level key — matches the virtual field name on the status global. */
  key: string
  /** Optional external tutorial URL for the section, rendered by the widget. */
  tutorialLink: string | null
  /**
   * Every check key any of this section's `documents` groups may emit.
   * `runSection` validates emitted keys against this map — drift between
   * the spec and the evaluators throws a typed error at read time.
   */
  checks: Record<string, CheckMetadata>
  /**
   * Optional pre-fetch / pre-compute hook. Runs once per section read;
   * the returned value is threaded into every group evaluator as
   * `sectionCtx`. Use this for shared collection fetches so multiple
   * groups don't double-query.
   */
  prepare?: (req: ProjectRequestContext<TConfig>) => Promise<TSectionCtx>
  /** Static list of groups — every group key is declared once, here. */
  groups: GroupSpec<TSectionCtx, TConfig>[]
}

/**
 * Top-level spec for a project's status global. The `slug`, `label`,
 * `adminGroup`, and `configTabFields` describe the Payload `GlobalConfig`
 * shell; `sections` are the seven virtual readiness fields; `collections`
 * carries section-level tutorial links that the generator script writes
 * into the JSON.
 */
export interface StatusGlobalSpec<TConfig> {
  slug: string
  label: string
  adminGroup: string
  collections: Record<string, { tutorialLink: string | null }>
  configTabFields: Field[]
  extractConfig: (data: unknown) => TConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: SectionSpec<TConfig, any>[]
}
