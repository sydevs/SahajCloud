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
 * - **`title` falls back to English, then to a constant.** `<title>` is
 *   mandatory markup and `AtlasSeoResponse` types it as a string: a blank one
 *   is a page a crawler cannot name at all, which is worse than one named in
 *   the wrong language. The constant also means the endpoint answers the root
 *   on the day it deploys, before any operator has typed anything — the same
 *   role `EMAIL_STRING_DEFAULTS` plays for this global's `emails` group.
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
 * The `<title>` used when no locale, English included, has one on file.
 *
 * Deliberately a name rather than a sentence — it is what the atlas *is*, in
 * the words the widget's own `common.free_meditation_classes` key already uses,
 * so an operator overwriting it is refining copy rather than replacing a
 * placeholder.
 */
export const ROOT_TITLE_FALLBACK = 'Free Meditation Classes'

/** Two strings out of seven groups, so the read names the one it wants. */
const SEO_GROUP_SELECT: SelectType = { seo: true } as never

/** The landing page's copy for one locale. */
export interface RootSeoStrings {
  /** Always a string — see the fallback chain above. */
  title: string
  /** The locale's own description, or `null`. Never English's. */
  description: string | null
}

/** A trimmed non-empty string, or `null` — blank and absent mean the same here. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The fallback chain, as a pure function of what the two reads returned.
 *
 * Exported so the asymmetry above is unit-testable without a database — it is
 * the whole decision this module exists to make, and the `null` English group
 * (a read that failed, rather than a locale that is blank) is the case a test
 * would otherwise never reach.
 */
export function resolveRootStrings(
  group: Record<string, unknown> | null,
  english: Record<string, unknown> | null,
): RootSeoStrings {
  const description = text(group?.root_description)
  return {
    title: text(group?.root_title) ?? text(english?.root_title) ?? ROOT_TITLE_FALLBACK,
    description,
  }
}

/**
 * The raw `seo` group for one locale, with every fallback disabled, or `null`
 * when the read failed.
 *
 * Never throws: a landing page falling back to its default title is a far
 * better outcome than a 500 on somebody else's page render. `null` is kept
 * distinct from `{}` so a failed read does not read as "this locale is blank"
 * and send the caller off to retry the same broken read in English.
 */
async function readSeoGroup(
  req: PayloadRequest,
  locale: LocaleCode,
): Promise<Record<string, unknown> | null> {
  try {
    const global = await req.payload.findGlobal({
      slug: 'sy-atlas-translations',
      locale,
      fallbackLocale: false,
      depth: 0,
      draft: false,
      select: SEO_GROUP_SELECT,
      overrideAccess: true,
      // A copy carrying the opt-out — the helper says why it must be a copy.
      req: withoutEnglishFallback(req),
    })
    const group = (global as { seo?: unknown }).seo
    return group && typeof group === 'object' ? (group as Record<string, unknown>) : {}
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
 * English is read only when the requested locale returned no title of its own,
 * so the common case — a translated locale, or English itself — costs one
 * query, and a failed read costs one rather than two.
 */
export async function getRootSeoStrings(
  req: PayloadRequest,
  locale: LocaleCode,
): Promise<RootSeoStrings> {
  const group = await readSeoGroup(req, locale)
  if (locale === DEFAULT_LOCALE || group === null || text(group.root_title)) {
    return resolveRootStrings(group, group)
  }
  return resolveRootStrings(group, await readSeoGroup(req, DEFAULT_LOCALE))
}
