import type { FieldHook, PayloadRequest, TextFieldSingleValidation } from 'payload'

import { ValidationError } from 'payload'
import { text as textFieldValidation } from 'payload/shared'

import { URL_RE } from '@/lib/eventQuality'
import type { EventTitleSlot } from '@/lib/eventTitle/compose'
import {
  addressPlaceName,
  composeEventTitleFromPlace,
  EVENT_TITLE_DEFAULTS,
  titleSlotForSchedule,
} from '@/lib/eventTitle/compose'
import { DEFAULT_LOCALE } from '@/lib/locales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

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
async function resolveTitleTemplates(req: PayloadRequest): Promise<Record<EventTitleSlot, string>> {
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
async function resolveTitlePlace(
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
export const eventTitleBeforeChange: FieldHook = async ({ value, data, originalDoc, req }) => {
  const incoming = typeof value === 'string' ? value : undefined
  const existing = typeof originalDoc?.title === 'string' ? originalDoc.title : undefined
  // `incoming ?? existing` keeps an existing title on a partial update (value
  // undefined) but lets an explicit clear (value '') fall through to auto-fill.
  const current = incoming ?? existing
  if (current && current.trim()) return current

  const place = await resolveTitlePlace(
    data?.address ?? originalDoc?.address,
    data?.region ?? originalDoc?.region,
    req,
  )
  // Nothing to name the place with. `required` can't be what refuses this any
  // more: `eventTitleValidate` has to permit a blank title so the browser —
  // where no hook runs — can reach this hook at all, and it can only see that a
  // region is *selected*, not that its name resolves. So the guarantee is
  // enforced here, at the one point that knows the auto-fill came up empty.
  // Reached only when the region read fails (a trashed region, a DB blip) or an
  // event somehow has neither an address nor a region.
  if (!place) {
    // A draft is allowed to be incomplete: Payload skips `required` entirely
    // for one, and this throw stands in for `required`, so it has to skip too.
    // The guarantee is that every *published* event carries a title.
    if ((data?._status ?? originalDoc?._status) === 'draft') return value
    throw new ValidationError({
      collection: 'events',
      errors: [
        {
          path: 'title',
          message: 'Add a title — this event has no venue or region to write one from.',
        },
      ],
    })
  }

  const templates = await resolveTitleTemplates(req)
  const slot = titleSlotForSchedule(data?.schedule ?? originalDoc?.schedule)
  // The guard above guarantees a usable place, so this returns a non-null string.
  return composeEventTitleFromPlace(templates[slot], place)
}

/**
 * `validate` for the Events `title` field — the other half of the hook above.
 *
 * Three jobs, in order:
 *
 * 1. **Refuse a link.** A title isn't clickable, so a URL in it is dead text.
 * 2. **Permit a blank title when the auto-fill can take over.** This is the
 *    load-bearing one. Field `beforeChange` hooks run *before* validation
 *    server-side (`payload/dist/fields/hooks/beforeChange/promise.js` — hooks at
 *    line 58, `validate` at 86), so on the server the field is already filled by
 *    the time it's checked. **In the browser no hook runs at all**, so a
 *    `required` blank field is refused before the request is ever sent — which
 *    made the admin reject the exact workflow this field's own description
 *    recommends ("Leave blank to fill in from the venue").
 *
 *    Permitting it costs `required` its teeth, because supplying `validate`
 *    replaces the default that enforces it (see 3). The guarantee doesn't rest
 *    on this function: the hook above **throws** when the auto-fill has nothing
 *    to work from, which is the only point that knows. What this decides is
 *    merely whether the browser bothers to ask the server — hence the cheap
 *    test (is a place *plausible*) rather than the real one.
 * 3. **Otherwise defer to Payload's own text validation** — composed rather
 *    than reimplemented, because supplying `validate` *replaces* the default
 *    (`payload/dist/fields/config/sanitize.js` installs it only when a field has
 *    none), which would silently drop the field's `maxLength`.
 */
export const eventTitleValidate: TextFieldSingleValidation = (value, options) => {
  if (typeof value === 'string' && URL_RE.test(value)) {
    return 'Remove the link — a title isn’t clickable. Put it in Website or Online URL instead.'
  }

  if (!value) {
    const { address, region } = (options.data ?? {}) as { address?: unknown; region?: unknown }
    // The hook will compose "Evening Meditation at «venue»" — or, with no
    // address, "…at «region»" — from these.
    if (addressPlaceName(address) || relationId(region) !== null) return true
    if (options.required) {
      return 'Add a title, or fill in the venue address and one will be written for you.'
    }
  }

  return textFieldValidation(value, options)
}
