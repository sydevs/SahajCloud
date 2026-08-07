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
 * Prerequisites a dependent check has made redundant.
 *
 * A check declaring `dependsOn` only runs at all once its prerequisite passed,
 * so a dependent that *also* passed states the same fact more precisely —
 * "Has a good quality description" already says "Has a description". Reporting
 * both is one row of noise in the panel and one line of it in the email.
 *
 * Only ever names checks that passed, so dropping them cannot change
 * `openCount` — which is what keeps a stored `qualityOpenCount` comparable
 * across this change, with no `QUALITY_CHECK_VERSION` bump.
 */
function impliedPrerequisites(results: QualityCheckResult[]): Set<string> {
  const passed = new Set(
    results.filter((result) => result.status === 'passed').map((result) => result.key),
  )
  const implied = new Set<string>()
  for (const check of EVENT_QUALITY_CHECKS) {
    if (check.dependsOn && passed.has(check.key)) implied.add(check.dependsOn)
  }
  return implied
}

/**
 * Build the listing-quality report for an event.
 *
 * Pure: everything it needs — the auto-title templates, the clock — is passed
 * in, so the whole check set is unit-testable without a Payload bootstrap.
 *
 * A check can leave the results in three ways, none of which pads the tally:
 * `requiresHandWrittenTitle` (nothing of the manager's to judge), `dependsOn`
 * while its prerequisite fails (the prerequisite is the finding worth showing),
 * and `dependsOn` in reverse — a passing prerequisite whose dependent also
 * passed has been superseded by it.
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
    if (check.dependsOn && failed.has(check.dependsOn)) continue
    const result = resolve(check, ctx)
    if (result.status === 'failed') failed.add(check.key)
    checks.push(result)
  }

  const implied = impliedPrerequisites(checks)
  const reported = checks.filter((result) => !implied.has(result.key))

  return {
    skipped: false,
    checks: reported,
    openCount: reported.filter((result) => result.status === 'failed').length,
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
