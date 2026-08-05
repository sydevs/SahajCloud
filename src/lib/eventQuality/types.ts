import type { RedundancyKind } from './copy'

import type { EventTitleSlot } from '@/lib/eventTitle/compose'


export type { RedundancyKind }

/** Auto-title templates per slot. */
export type TitleTemplateSet = Record<EventTitleSlot, string>

/**
 * `pending` is neither a pass nor a failure: the thing being judged cannot
 * exist yet. Kept in the contract even though no check currently emits one —
 * the sibling reminder-email ticket is expected to want it.
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
  /**
   * What went wrong, for a check that folds several problems into one finding.
   * Replaces the check's static `description` in the panel, so "Improve the
   * event description" can go on to name the address and the weekday it
   * actually found. Absent when the check has nothing more specific to add.
   */
  detail?: string
}

/** Why the checks weren't run at all. */
export type QualitySkipReason = 'unpublished' | 'finished' | 'expired' | 'trashed'

/**
 * The whole report, as returned by the virtual field in a single read.
 *
 * Flat: `title` stopped being localized, so there is no per-locale dimension
 * left — the Atlas widget translates client-side from the one stored value.
 */
export type EventQualityReport =
  | {
      skipped: true
      reason: QualitySkipReason
    }
  | {
      skipped: false
      checks: QualityCheckResult[]
      /** Open (failed) items — what `qualityOpenCount` stores. */
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
  title?: string | null
}

/** What a check's `evaluate` is handed. */
export type CheckContext = {
  event: EventQualityInput
  /**
   * The description flattened to plain text, computed once per report rather
   * than per check — each read walks the Lexical tree.
   */
  descriptionText: string
  /**
   * The non-empty strings the address already renders on the listing (venue,
   * street, city). Computed once per report for the same reason.
   */
  addressPhrases: string[]
  /** The stored title, trimmed. */
  title: string
  /**
   * The year "now" falls in, for judging whether a date has gone stale. Passed
   * in rather than read off the clock so every check stays a pure function.
   */
  currentYear: number
}

/**
 * One entry in the registry. Wording is spread in from `copy.ts`, so a check
 * here is only its key, its preconditions and its logic.
 */
export type QualityCheck = {
  key: string
  /** The recommendation, in the imperative — shown when the check **fails**. */
  label: string
  /**
   * The same item worded as a state already reached, for when the check
   * **passes**. Reusing `label` there put a tick beside an instruction, which
   * read as "yes, do repeat the address" — the opposite of the point.
   */
  passedLabel: string
  /** Why this is worth doing, and what to write. */
  description: string
  /**
   * Skip this check when the title is the auto-fill (or absent). The
   * auto-title is generated from the venue by design, so judging its wording
   * would flag the exact state #605 set out to create.
   */
  requiresHandWrittenTitle?: true
  /**
   * Skip this check when the named check has failed — for a finding that only
   * makes sense once its prerequisite is satisfied. Keeps the panel from
   * saying two things about one empty field.
   */
  skipWhenFailed?: string
  /** True when the listing **fails** this check. */
  evaluate: (ctx: CheckContext) => boolean
  /**
   * Names the specific problems behind a failure, for checks that cover
   * several at once. Called only when `evaluate` fails; the panel shows the
   * result in place of `description`.
   */
  detail?: (ctx: CheckContext) => string | null
}
