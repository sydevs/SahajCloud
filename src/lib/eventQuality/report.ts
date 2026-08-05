import type {
  CheckContext,
  EventQualityInput,
  EventQualityReport,
  QualityCheck,
  QualityCheckResult,
  TitleTemplateSet,
} from './types'

import { EVENT_TITLE_DEFAULTS } from '@/lib/eventTitle/compose'

import { isAutoFilledTitle } from './autoTitle'
import { eventAddressPhrases, eventDescriptionText, EVENT_QUALITY_CHECKS } from './checks'
import { shouldSkipQualityChecks } from './skip'

export type BuildReportOptions = {
  /** Auto-title templates, for recognising a title the auto-fill wrote. */
  templates?: TitleTemplateSet
  /** "Now", for judging stale dates. Defaults to the current clock. */
  now?: Date
}

/**
 * Run one check, attaching the specific problems it found when it fails.
 * `detail` is only consulted on failure — a passing check has nothing to name.
 */
function resolve(check: QualityCheck, ctx: CheckContext): QualityCheckResult {
  if (!check.evaluate(ctx)) return { key: check.key, status: 'passed' }
  const detail = check.detail?.(ctx)
  return detail
    ? { key: check.key, status: 'failed', detail }
    : { key: check.key, status: 'failed' }
}

/**
 * Build the listing-quality report for an event.
 *
 * Pure: everything it needs — the auto-title templates, the clock — is passed
 * in, so the whole check set is unit-testable without a Payload bootstrap.
 *
 * A check can bow out rather than report, in two ways: `requiresHandWrittenTitle`
 * (nothing of the manager's to judge) and `skipWhenFailed` (its prerequisite is
 * the finding worth showing). Neither appears in the results at all — a skipped
 * check is not a passing one, and shouldn't pad the tally.
 */
export function buildEventQualityReport(
  event: EventQualityInput,
  options: BuildReportOptions = {},
): EventQualityReport {
  const reason = shouldSkipQualityChecks(event)
  if (reason) return { skipped: true, reason }

  const title = (event.title ?? '').trim()
  const ctx: CheckContext = {
    event,
    title,
    currentYear: (options.now ?? new Date()).getUTCFullYear(),
    // Both walk a structure every time they're read, and several checks want
    // them — so they're computed once here and passed down.
    descriptionText: eventDescriptionText(event),
    addressPhrases: eventAddressPhrases(event),
  }

  const handWritten =
    title.length > 0 && !isAutoFilledTitle(title, event, options.templates ?? EVENT_TITLE_DEFAULTS)

  const checks: QualityCheckResult[] = []
  const failed = new Set<string>()
  for (const check of EVENT_QUALITY_CHECKS) {
    if (check.requiresHandWrittenTitle && !handWritten) continue
    if (check.skipWhenFailed && failed.has(check.skipWhenFailed)) continue
    const result = resolve(check, ctx)
    if (result.status === 'failed') failed.add(check.key)
    checks.push(result)
  }

  return {
    skipped: false,
    checks,
    openCount: checks.filter((result) => result.status === 'failed').length,
  }
}

/**
 * The stored `qualityOpenCount` for an event — the count a `beforeChange` can
 * compute from the document it already has, with no extra read.
 */
export function countOpenDocumentIssues(event: EventQualityInput, now?: Date): number {
  const report = buildEventQualityReport(event, { now })
  return report.skipped ? 0 : report.openCount
}
