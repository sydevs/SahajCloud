import type { PayloadRequest } from 'payload'

import type { EventTitleSlot } from '@/lib/eventTitle/compose'
import { EVENT_TITLE_DEFAULTS, EVENT_TITLE_SLOTS } from '@/lib/eventTitle/compose'
import { DEFAULT_LOCALE } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import type { TitleTemplateSet } from './types'

/** Where the in-flight templates load is stashed on `req.context`. */
const TEMPLATES_CACHE_KEY = 'eventQualityTitleTemplates'

/**
 * The auto-title templates, so a report can tell a title the auto-fill wrote
 * from one a manager typed.
 *
 * Read in the default locale, matching what `eventTitleBeforeChange` composes
 * with: `title` is a single non-localized column, so there is one template set
 * that matters. Memoized per request — a bulk read would otherwise pay this
 * `findGlobal` per event, and the ExpireEvents sweep would pay it per due event.
 *
 * Lives here rather than beside the Events hook because both owners of the
 * check registry need it: the collection's `qualityReport` field and the
 * reminder emails the ExpireEvents job sends (#611).
 */
export async function loadTitleTemplates(req: PayloadRequest): Promise<TitleTemplateSet> {
  return memoizeOnRequest(req, TEMPLATES_CACHE_KEY, async () => {
    try {
      const translations = await req.payload.findGlobal({
        slug: 'sy-atlas-translations',
        locale: DEFAULT_LOCALE,
        depth: 0,
        // Copied — the locale above would otherwise repoint the caller's
        // request, and this runs during writes. See localeIsolatedReq.
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
