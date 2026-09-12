/**
 * The atlas landing page's own copy — the one page in the atlas that names no
 * document, and so has no name of its own to borrow (#739).
 *
 * Everything else this endpoint answers describes a row: a region's name, an
 * event's title and description. The root describes the atlas itself, so its
 * title and meta description are **operator-written**, on the `seo` group of
 * `sy-atlas-translations`. That global was chosen over `sy-atlas-config`
 * because it is already localized, already seeded in ten locales, and already
 * the place a translator visits.
 *
 * ## Two fallbacks, deliberately asymmetric
 *
 * - **`title` falls back within the locale first.** `<title>` is mandatory
 *   markup and `AtlasSeoResponse` types it as a string, so it must resolve to
 *   something. It resolves to the locale's own `common.chrome.widget_label`
 *   — the widget's name for itself, already seeded in ten locales — before it
 *   looks at English, so a locale nobody has written `seo.root_title` for is
 *   named in its own language rather than in ours. English, and then the
 *   constant, are reached only by a locale carrying neither string.
 * - **`description` never falls back.** A locale with no description gets
 *   `null`, exactly as a region does, and the host writes its own line in its
 *   own language. An untranslated English sentence in a Dutch site's `<head>`
 *   is worse than none, which is the rule #646 set and this keeps.
 *
 * Holding that second rule is why every read here opts out of the global's
 * `clientEnglishFallback` hook — which fills blank keys from English for any
 * `clients` read, and would silently supply the sentence we just refused to
 * invent — and passes `fallbackLocale: false`, which turns off Payload's own
 * per-field substitution too. What comes back is the locale's true copy, and
 * {@link resolveRootStrings} decides what an absence means.
 */

import type { PayloadRequest, SelectType } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { DEFAULT_LOCALE } from '@/lib/locales'
import { withoutEnglishFallback } from '@/lib/translations/clientEnglishFallback'

/**
 * The `<title>` used when neither the locale nor English names the atlas at
 * all — no `seo.root_title`, and no `common.chrome.widget_label` either.
 *
 * It is that same key's English wording, title-cased, so the constant is a last
 * resort rather than a second voice: reaching it means the global is empty,
 * which is only true of a brand-new database.
 */
export const ROOT_TITLE_FALLBACK = 'Free Meditation Classes'

/**
 * Two columns out of thirty-three, so the read names the ones it wants.
 *
 * `common` is a group of collapsibles since #706, so the select descends into
 * it rather than taking all seven of its columns — `chrome` is the only one
 * that names the atlas.
 */
const ROOT_COPY_SELECT: SelectType = { common: { chrome: true }, seo: true }

/** The landing page's copy for one locale. */
export interface RootSeoStrings {
  /** Always a string — see the fallback chain above. */
  title: string
  /** The locale's own description, or `null`. Never English's. */
  description: string | null
}

/** One locale's raw copy — the two groups the chain reads, each blank or absent. */
export interface RootCopy {
  /** The widget's own chrome strings, seeded in every locale (`{ chrome: {…} }`). */
  common: Record<string, unknown> | null
  /** The landing page's operator-written copy. Empty everywhere until someone writes it. */
  seo: Record<string, unknown> | null
}

/** A trimmed non-empty string, or `null` — blank and absent mean the same here. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The best name one locale can offer: what the operator wrote for the landing
 * page, then what the widget already calls itself in that language.
 *
 * Both come from the same locale, so neither borrows another language's words.
 */
function titleIn(copy: RootCopy | null): string | null {
  return text(copy?.seo?.root_title) ?? text(group(copy?.common?.chrome)?.widget_label)
}

/**
 * The fallback chain, as a pure function of what the two reads returned.
 *
 * Exported so the asymmetry above is unit-testable without a database — it is
 * the whole decision this module exists to make, and the `null` English copy
 * (a read that failed, rather than a locale that is blank) is the case a test
 * would otherwise never reach.
 */
export function resolveRootStrings(
  copy: RootCopy | null,
  english: RootCopy | null,
): RootSeoStrings {
  return {
    title: titleIn(copy) ?? titleIn(english) ?? ROOT_TITLE_FALLBACK,
    description: text(copy?.seo?.root_description),
  }
}

/** A group as read back, or `null` when the locale carries none. */
function group(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

/**
 * The raw `common` and `seo` groups for one locale, with every fallback
 * disabled, or `null` when the read failed.
 *
 * Never throws: a landing page falling back to its default title is a far
 * better outcome than a 500 on somebody else's page render. A failed read is
 * kept distinct from a blank locale so it does not send the caller off to
 * retry the same broken read in English.
 */
async function readRootCopy(req: PayloadRequest, locale: LocaleCode): Promise<RootCopy | null> {
  try {
    const global = await req.payload.findGlobal({
      slug: 'sy-atlas-translations',
      locale,
      fallbackLocale: false,
      depth: 0,
      draft: false,
      select: ROOT_COPY_SELECT,
      overrideAccess: true,
      // A copy carrying the opt-out — the helper says why it must be a copy.
      req: withoutEnglishFallback(req),
    })
    const { common, seo } = global as { common?: unknown; seo?: unknown }
    return { common: group(common), seo: group(seo) }
  } catch (error) {
    req.payload.logger.debug({
      msg: 'atlasSeo: root copy read failed; using defaults',
      locale,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * The landing page's title and description for `locale`.
 *
 * English is read only when the requested locale names the atlas in neither of
 * its two groups, so the common case — any seeded locale, or English itself —
 * costs one query, and a failed read costs one rather than two.
 */
export async function getRootSeoStrings(
  req: PayloadRequest,
  locale: LocaleCode,
): Promise<RootSeoStrings> {
  const copy = await readRootCopy(req, locale)
  if (locale === DEFAULT_LOCALE || copy === null || titleIn(copy)) {
    return resolveRootStrings(copy, copy)
  }
  return resolveRootStrings(copy, await readRootCopy(req, DEFAULT_LOCALE))
}
