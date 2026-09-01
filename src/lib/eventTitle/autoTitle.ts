import type { EventTitleSlot } from './compose'
import type { PayloadRequest } from 'payload'

import { DEFAULT_LOCALE } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'


export { composeEventTitleFromPlace } from './compose'

import {
  addressPlaceName,
  composeEventTitleFromPlace,
  EVENT_TITLE_DEFAULTS,
  titleSlotForSchedule,
} from './compose'

/**
 * Resolving an event's auto-title against the database — the impure half of
 * this folder (`compose.ts` is the pure half).
 *
 * Lifted out of the Events title hook when EventSubmissions needed the same
 * answer: a submission proposing a new event is labelled with the title that
 * event would be given on creation, and computing that a second way would let
 * the two drift. Per `src/AGENTS.md`, code two owners
 * need lives in `src/lib/`, not in one owner's folder.
 */

/** Where the in-flight `sy-atlas-translations` load is stashed on `req.context`. */
const CACHE_KEY = 'eventTitleTemplates'

/** Prefix for the per-region name loads stashed alongside it. */
const REGION_NAME_KEY = 'eventTitleRegionName'

/**
 * Load the localized auto-title templates from the Sahaj Atlas translations
 * global at most once per request, shared across many events being saved (e.g.
 * during bulk imports or ExpireEvents job runs). Each slot falls back to its
 * English default independently, so a partially translated locale still yields
 * a complete set.
 *
 * `memoizeOnRequest` is what collapses a bulk save's N concurrent hooks to one
 * `findGlobal` — see its own doc comment for why the in-flight promise, rather
 * than the resolved value, is the thing cached.
 */
export async function resolveTitleTemplates(req: PayloadRequest): Promise<Record<EventTitleSlot, string>> {
  return memoizeOnRequest(req, CACHE_KEY, async () => {
    try {
      const translations = await req.payload.findGlobal({
        slug: 'sy-atlas-translations',
        // The default locale, not `req.locale`: `title` is a single
        // non-localized column now, so composing from whichever locale the
        // manager happened to be editing in would store a German title for one
        // and an English one for the next. The widget translates client-side
        // from this one value.
        locale: DEFAULT_LOCALE,
        depth: 0,
        // Copied — the locale above would otherwise repoint the caller's
        // request, and this hook runs during a write. See localeIsolatedReq.
        req: localeIsolatedReq(req),
      })
      const stored = (translations as { event?: { title?: Record<string, unknown> } }).event?.title
      const resolved = { ...EVENT_TITLE_DEFAULTS }
      for (const slot of Object.keys(EVENT_TITLE_DEFAULTS) as EventTitleSlot[]) {
        const value = stored?.[slot]
        if (typeof value === 'string' && value.trim()) resolved[slot] = value
      }
      return resolved
    } catch (error) {
      req.payload.logger.debug({
        msg: 'Failed to read sy-atlas-translations event.title; using defaults',
        error,
      })
      return { ...EVENT_TITLE_DEFAULTS }
    }
  })
}

/**
 * The place an auto-title names. The venue (or, failing that, the street) when
 * the event has an address; otherwise the region it hangs off — an online event
 * has no address at all, so "Evening Meditation at Toronto" is composed from its
 * city node. Returns `''` when there is nothing to name the event after.
 *
 * The region read is memoized per request like the templates above: a bulk save
 * of many events in one city resolves the name once. Region `name` is not
 * localized (see Regions.ts), so this needs no locale handling.
 */
export async function resolveTitlePlace(
  address: unknown,
  region: unknown,
  req: PayloadRequest,
): Promise<string> {
  const fromAddress = addressPlaceName(address)
  if (fromAddress) return fromAddress

  const id = relationId(region)
  if (id === null) return ''

  return memoizeOnRequest(req, `${REGION_NAME_KEY}:${id}`, async () => {
    try {
      const doc = await req.payload.findByID({
        collection: 'regions',
        id,
        depth: 0,
        // A narrow select is required, not an optimization: this forwards the
        // caller's (possibly API-client) request, and the client-query gate
        // rejects an unbounded nested read with a 400.
        select: { name: true },
        req,
      })
      return typeof doc.name === 'string' ? doc.name.trim() : ''
    } catch (error) {
      req.payload.logger.debug({ msg: 'Failed to read the event’s region name', error })
      return ''
    }
  })
}

/**
 * beforeChange hook for the Events `title` field. An explicit title (newly
 * entered, or carried over on a partial update) is kept as-is; an empty title
 * is auto-filled from the event's place and the time of day it starts —
 * "Evening Meditation at Broadstairs Friends Meeting House", or, for an online
 * event, "Evening Meditation at Toronto". `title` is a single non-localized
 * column (#609), so this composes one value in the default locale whichever
 * locale the manager is editing in; clearing the field re-triggers the auto-fill.
 */

/**
 * The title an event would be given if it were created now with this data:
 * "<Morning|Afternoon|Evening> Meditation at <place>". Returns `null` when
 * there is nothing to name it after — the caller decides whether that is a
 * validation failure (Events) or a fallback (EventSubmissions).
 */
export async function autoEventTitle(args: {
  address?: unknown
  region?: unknown
  schedule?: unknown
  req: PayloadRequest
}): Promise<string | null> {
  const place = await resolveTitlePlace(args.address, args.region, args.req)
  if (!place) return null
  const templates = await resolveTitleTemplates(args.req)
  return composeEventTitleFromPlace(templates[titleSlotForSchedule(args.schedule)], place)
}
