import type { CollectionBeforeChangeHook, FieldHook, PayloadRequest } from 'payload'

import type { EventQualityInput, EventQualityReport, TitleTemplateSet } from '@/lib/eventQuality'
import {
  buildEventQualityReport,
  countOpenDocumentIssues,
  QUALITY_CHECK_VERSION,
  shouldSkipQualityChecks,
} from '@/lib/eventQuality'
import type { EventTitleSlot } from '@/lib/eventTitle/compose'
import { EVENT_TITLE_DEFAULTS, EVENT_TITLE_SLOTS } from '@/lib/eventTitle/compose'
import { DEFAULT_LOCALE } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/** Where the in-flight templates load is stashed on `req.context`. */
const TEMPLATES_CACHE_KEY = 'eventQualityTitleTemplates'

/**
 * The auto-title templates, so the report can tell a title the auto-fill wrote
 * from one a manager typed.
 *
 * Read in the default locale, matching what `eventTitleBeforeChange` composes
 * with: `title` is a single non-localized column, so there is one template set
 * that matters. Memoized per request — a bulk read would otherwise pay this
 * `findGlobal` per event.
 */
async function loadTitleTemplates(req: PayloadRequest): Promise<TitleTemplateSet> {
  return memoizeOnRequest(req, TEMPLATES_CACHE_KEY, async () => {
    try {
      const translations = await req.payload.findGlobal({
        slug: 'sy-atlas-translations',
        locale: DEFAULT_LOCALE,
        depth: 0,
        // Copied — the locale above would otherwise repoint the caller's
        // request, and this hook runs during writes. See localeIsolatedReq.
        req: localeIsolatedReq(req),
      })
      const stored = (translations as { event?: { title?: Record<string, unknown> } }).event?.title
      const resolved = { ...EVENT_TITLE_DEFAULTS }
      for (const slot of EVENT_TITLE_SLOTS) {
        const value = (stored as Record<EventTitleSlot, unknown> | undefined)?.[slot]
        if (typeof value === 'string' && value.trim()) resolved[slot] = value
      }
      return resolved
    } catch (error) {
      req.payload.logger.debug({
        msg: 'Failed to read sy-atlas-translations event.title for quality checks; using defaults',
        error,
      })
      return { ...EVENT_TITLE_DEFAULTS }
    }
  })
}

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
