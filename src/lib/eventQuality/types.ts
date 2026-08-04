import type { EventTitleSlot } from '@/lib/eventTitle/compose'
import type { LocaleCode } from '@/lib/locales'

/**
 * Which concern a check belongs to. Tiers group the panel and let a consumer
 * (the reminder email, say) surface only the tiers it cares about.
 */
export type QualityTier = 'completeness' | 'title' | 'description' | 'translation'

export const QUALITY_TIERS = ['completeness', 'title', 'description', 'translation'] as const

/**
 * `document` checks read fields that aren't localized (`description`, `images`,
 * `website`, contacts) and are evaluated once. `perLocale` checks read the
 * localized `title`, so they're evaluated once per locale in scope.
 */
export type CheckScope = 'document' | 'perLocale'

/**
 * `pending` is neither a pass nor a failure: the thing being judged cannot
 * exist yet. It is emitted for a locale added in the save currently in flight —
 * a translation can't have been written for a language chosen a moment ago, and
 * reporting that as a failure would scold a manager for the edit they just made.
 */
export type CheckStatus = 'passed' | 'failed' | 'pending'

/**
 * A single evaluated check. Modelled on `CheckResult` in `@/lib/status` — a
 * stable `key` with the human-readable label resolved separately — which is
 * what lets the reminder email localize these later.
 */
export type QualityCheckResult = {
  key: string
  status: CheckStatus
}

/** Why the checks weren't run at all. */
export type QualitySkipReason = 'unpublished' | 'finished' | 'expired' | 'trashed'

/**
 * The whole multi-locale report, as returned by the virtual field in a single
 * read. Deliberately **not** localized: `perLocale` is the answer to "which of
 * my languages is missing a title", which a localized field could never give.
 */
export type EventQualityReport =
  | {
      skipped: true
      reason: QualitySkipReason
    }
  | {
      skipped: false
      /** Checks evaluated once for the whole document. */
      document: QualityCheckResult[]
      /** Checks evaluated per locale, keyed by locale code. */
      perLocale: Record<string, QualityCheckResult[]>
      /** Locales evaluated, in the order they were judged (default locale first). */
      locales: LocaleCode[]
      /** Open (failed) **document-scope** items — what `qualityOpenCount` stores. */
      openCount: number
    }

/**
 * The slice of an event a check reads. Loose on purpose: the report is built
 * from a Payload document, from `{ ...originalDoc, ...data }` inside a
 * `beforeChange`, and from hand-written fixtures in the unit lane — none of
 * which share a single generated type.
 */
export type EventQualityInput = {
  _status?: string | null
  deletedAt?: string | null
  verificationStage?: string | null
  description?: unknown
  images?: unknown
  website?: unknown
  onlineUrl?: unknown
  contactPhone?: unknown
  contactEmail?: unknown
  address?: unknown
  schedule?: unknown
  languages?: unknown
  /**
   * Localized title. A single string when the document was read in one locale,
   * or a per-locale map when read with `locale: 'all'` — which is how the
   * per-locale tier gets every language's title from one query.
   */
  title?: string | Record<string, string | null | undefined> | null
}

/** Auto-title templates per slot, for one locale. */
export type TitleTemplateSet = Record<EventTitleSlot, string>

/** What a check's `evaluate` is handed. */
export type CheckContext = {
  event: EventQualityInput
  /** Only set for `perLocale` checks — the locale being judged. */
  locale?: LocaleCode
  /** The title stored for `locale`, already resolved off the localized field. */
  title?: string
  /**
   * Auto-title templates for `locale`, English defaults when the locale has no
   * translation. A title equal to a composition of these is auto-filled.
   */
  templates?: TitleTemplateSet
  /**
   * The year "now" falls in, for judging whether a date has gone stale. Passed
   * in rather than read off the clock so every check stays a pure function.
   */
  currentYear: number
}

/**
 * One entry in the registry. `label`/`description` live here so the code stays
 * the single source of truth — a test asserts every key carries both, so a new
 * check cannot ship unlabelled.
 */
export type QualityCheck = {
  key: string
  tier: QualityTier
  scope: CheckScope
  label: string
  description: string
  /** True when the listing **fails** this check. */
  evaluate: (ctx: CheckContext) => boolean
}
