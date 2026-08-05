/**
 * Listing-quality checks for Atlas events (#609).
 *
 * A registry of named checks that flag an event listing as incomplete or
 * low-quality, exposed as a report on the document and rendered in the admin
 * edit view by `EventQualityPanel`. **Advisory only** — nothing here blocks
 * publishing, hides an event, or gates the Verify action.
 *
 * Lives in `src/lib/` rather than `src/collections/Events/` because the
 * collection, the admin panel and the reminder emails all consume it.
 */
export { isAutoFilledTitle } from './autoTitle'
export {
  DESCRIPTION_MIN_LENGTH,
  EVENT_QUALITY_CHECK_METADATA,
  EVENT_QUALITY_CHECKS,
  MINIMUM_IMAGES,
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
  type BuildReportOptions,
} from './report'
export { SKIP_REASON_LABELS, shouldSkipQualityChecks } from './skip'
export type {
  CheckStatus,
  EventQualityInput,
  EventQualityReport,
  QualityCheck,
  QualityCheckResult,
  QualitySkipReason,
  TitleTemplateSet,
} from './types'
