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
 * What that buys, and what it costs: the widget must ship a UI bundle for
 * everything enabled here, and *it* is the only side that knows what it
 * shipped. A language enabled with no bundle renders the English fallback while
 * our `hreflang` tells a crawler that language has a page — a promise we can't
 * keep. SahajAtlasWeb asserts `bundles ⊇ enabled` in CI so that surfaces at
 * build time; there is deliberately no runtime guard here, because a silent
 * intersection would hide the misconfiguration instead of fixing it.
 */

import type { PayloadRequest } from 'payload'

import { ATLAS_DEFAULT_LOCALES } from '@/lib/atlas/defaultLocales'
import type { LocaleCode } from '@/lib/locales'
import { isValidLocale } from '@/lib/locales'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/** `req.context` key for the per-request locale memo. */
const LOCALES_MEMO_KEY = 'atlas:enabledLocales'

/**
 * What an unconfigured global answers with — the same constant the field
 * defaults to, so the two can never drift.
 *
 * The field is `required`, so an empty stored value only ever means "never
 * configured", never "an operator turned everything off". Falling back to the
 * launch set therefore makes this change a no-op on an installation that has
 * not opted in yet — which matters because production's row already exists (it
 * has held the map centre for a while) and a field `defaultValue` does not
 * backfill it. See `@/lib/atlas/defaultLocales`.
 */
const FALLBACK_LOCALES: LocaleCode[] = [...ATLAS_DEFAULT_LOCALES]

/**
 * Normalize whatever is stored on the global into a usable locale list.
 *
 * Pure, and exported, because the interesting cases are **states the API cannot
 * produce**: the field is `required` with `minRows: 1`, so an operator can
 * never save an empty set — an empty value only ever means the column predates
 * the field, which is exactly what production looks like the moment this
 * deploys. That is untestable through `updateGlobal` and trivially testable
 * here.
 *
 * Rows are `{ code }`, not bare strings — see the field's own comment for why
 * it is an array, and why it is named `languages`.
 */
export function normalizeLanguages(stored: unknown): LocaleCode[] {
  if (!Array.isArray(stored)) return FALLBACK_LOCALES

  // Validated rather than trusted: a locale later removed from `LOCALES` in
  // code would otherwise survive in stored data and be published as an
  // alternate for a language the CMS can no longer render. Duplicates are
  // dropped for the same reason — nothing stops an operator adding a row twice,
  // and a repeated `hreflang` is invalid markup.
  const seen = new Set<string>()
  const enabled: LocaleCode[] = []
  for (const row of stored) {
    const code = String((row as { code?: unknown })?.code ?? '')
    if (!isValidLocale(code) || seen.has(code)) continue
    seen.add(code)
    enabled.push(code)
  }
  return enabled.length > 0 ? enabled : FALLBACK_LOCALES
}

async function loadEnabledLocales(req: PayloadRequest): Promise<LocaleCode[]> {
  const config = await req.payload.findGlobal({
    slug: 'sy-atlas-config',
    depth: 0,
    overrideAccess: true,
    req,
  })
  return normalizeLanguages((config as { languages?: unknown }).languages)
}

/**
 * The enabled locales for this request, resolved once.
 *
 * Memoized on the request like the region tree, so a route that resolves a
 * document, its ancestry and its listing still reads the global exactly once.
 */
export function getAtlasLocales(req: PayloadRequest): Promise<LocaleCode[]> {
  return memoizeOnRequest(req, LOCALES_MEMO_KEY, () => loadEnabledLocales(req))
}
