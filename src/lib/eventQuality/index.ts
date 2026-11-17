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
// `URL_RE` alone: the rest are read by `./checks` next door, by its own
// relative import. The Atlas sync's data check was the one outside consumer
// of the wider line, and it is retired (#1169).
export { URL_RE } from './heuristics'
export { buildEventQualityReport, countOpenDocumentIssues, type BuildReportOptions } from './report'
export { eventQualityReportZodSchema } from './schema'
export { SKIP_REASON_LABELS, shouldSkipQualityChecks } from './skip'
export { loadTitleTemplates } from './titleTemplates'
export type {
  CheckStatus,
  EventQualityInput,
  QualityCheck,
  QualityCheckResult,
  QualitySkipReason,
  TitleTemplateSet,
} from './types'
