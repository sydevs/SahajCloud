/**
 * The languages the atlas is offered in, as an operator set them on the
 * `sy-atlas-config` global.
 *
 * **The global is the source of truth** (#645 follow-up). It used to be a
 * constant here, duplicating `supportedLanguages` in sydevs/SahajAtlasWeb — two
 * lists that could disagree, neither of which an operator could change. Now the
 * CMS holds it and the widget reads it, so enabling a language is a content
 * decision rather than a deploy in two repos.
 *
 * Since #705 the field is `availableLocales`, and it is gated: a locale can only
 * be offered once the Sahaj Atlas translations are published in it. So an
 * alternate published here now means the CMS really can render that language.
 *
 * What that still does not cover, and what it costs: the widget must ship a UI
 * bundle for everything enabled here, and *it* is the only side that knows what
 * it shipped. A language enabled with no bundle renders the English fallback
 * while our `hreflang` tells a crawler that language has a page — a promise we
 * can't keep. SahajAtlasWeb asserts `bundles ⊇ enabled` in CI so that surfaces
 * at build time; there is deliberately no runtime guard here, because a silent
 * intersection would hide the misconfiguration instead of fixing it.
 */

import type { PayloadRequest } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { readAvailableLocales } from '@/lib/translations/availableLocales'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/** `req.context` key for the per-request locale memo. */
const LOCALES_MEMO_KEY = 'atlas:enabledLocales'

async function loadEnabledLocales(req: PayloadRequest): Promise<LocaleCode[]> {
  const config = await req.payload.findGlobal({
    slug: 'sy-atlas-config',
    depth: 0,
    overrideAccess: true,
    req,
  })
  return readAvailableLocales((config as { availableLocales?: unknown }).availableLocales)
}

/**
 * The enabled locales for this request, resolved once.
 *
 * Memoized on the request like the region tree, so a route that resolves a
 * document, its ancestry and its listing still reads the global exactly once.
 *
 * An unconfigured row answers `['en']` — see `readAvailableLocales` for why
 * that, and not the launch set, is the safe default.
 */
export function getAtlasLocales(req: PayloadRequest): Promise<LocaleCode[]> {
  return memoizeOnRequest(req, LOCALES_MEMO_KEY, () => loadEnabledLocales(req))
}
