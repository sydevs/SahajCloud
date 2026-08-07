import type { CollectionBeforeChangeHook, FieldHook } from 'payload'

import type { EventQualityInput, EventQualityReport } from '@/lib/eventQuality'
import {
  buildEventQualityReport,
  countOpenDocumentIssues,
  loadTitleTemplates,
  QUALITY_CHECK_VERSION,
  shouldSkipQualityChecks,
} from '@/lib/eventQuality'

/**
 * `afterRead` for the virtual `qualityReport` field.
 *
 * The report costs one extra read, and exactly one consumer wants it: the admin
 * edit view. So it is skipped for the two read shapes that would pay that cost
 * by the hundred and never look at the result:
 *
 * - **list reads** (`findMany`) — 25 rows would mean 25 extra queries to render
 *   a list that shows the stored `qualityOpenCount` instead;
 * - **system writes** (`req.context.skipVerifyHook`) — the marker the Atlas
 *   importer and the ExpireEvents job already set on their own writes. Payload
 *   runs `afterRead` on the document an `update` returns, so a 500-event import
 *   would otherwise pay a query per event for a report nothing reads.
 */
export const computeEventQualityReport: FieldHook = async ({ data, req, findMany }) => {
  if (findMany || req.context?.skipVerifyHook) return null
  const event = (data ?? {}) as EventQualityInput & { id?: number | string }
  if (event.id == null) return null

  // Cheap exit before the query — a skipped report doesn't need the templates,
  // and the predicate alone avoids walking the description tree.
  const reason = shouldSkipQualityChecks(event)
  if (reason) return { skipped: true, reason }

  return buildEventQualityReport(event, {
    templates: await loadTitleTemplates(req),
  }) satisfies EventQualityReport
}

/**
 * Collection-level `beforeChange` stamping the two stored columns.
 *
 * Collection-level, not a field hook, on purpose: Payload materialises `{}` for
 * a group an incoming patch omits, so a field hook computing from its own
 * sibling data would NULL the column on every unrelated write — the trap
 * documented for `computeLastDate` in `.claude/rules/collections.md`. Computing
 * from `{ ...originalDoc, ...data }` means a partial patch recomputes against
 * the whole document, an unrelated patch is a no-op, and any write back-fills a
 * row that predates the column.
 */
export const stampEventQuality: CollectionBeforeChangeHook = async ({ data, originalDoc }) => {
  const merged = { ...(originalDoc ?? {}), ...data } as EventQualityInput

  return {
    ...data,
    qualityOpenCount: countOpenDocumentIssues(merged),
    qualityCheckVersion: QUALITY_CHECK_VERSION,
  }
}
