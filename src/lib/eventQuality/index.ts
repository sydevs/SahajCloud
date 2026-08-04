/**
 * Listing-quality checks for Atlas events (#609).
 *
 * A registry of named checks that flag an event listing as incomplete or
 * low-quality, exposed as a report on the document and rendered in the admin
 * edit view by `EventQualityPanel`. **Advisory only** — nothing here blocks
 * publishing, hides an event, or gates the Verify action.
 *
 * Lives in `src/lib/` rather than `src/collections/Events/` because the
 * collection, the reminder emails and the backfill script all consume it.
 */
export { isAutoFilledTitle } from './autoTitle'
export {
  DESCRIPTION_MIN_LENGTH,
  DOCUMENT_SCOPE_CHECKS,
  EVENT_QUALITY_CHECK_METADATA,
  EVENT_QUALITY_CHECKS,
  PER_LOCALE_CHECKS,
  QUALITY_CHECK_VERSION,
} from './checks'
export {
  containsContactInfo,
  containsScheduleInfo,
  containsUrl,
  EMAIL_RE,
  findStaleDates,
  GENERIC_TITLE_RE,
  lexicalPlainText,
  URL_RE,
} from './heuristics'
export {
  buildEventQualityReport,
  countOpenDocumentIssues,
  localeForLanguage,
  qualityLocalesForEvent,
  titleForLocale,
  type BuildReportOptions,
} from './report'
export { SKIP_REASON_LABELS, shouldSkipQualityChecks } from './skip'
export type {
  CheckScope,
  CheckStatus,
  EventQualityInput,
  EventQualityReport,
  QualityCheck,
  QualityCheckResult,
  QualitySkipReason,
  QualityTier,
  TitleTemplateSet,
} from './types'
export { QUALITY_TIERS } from './types'
