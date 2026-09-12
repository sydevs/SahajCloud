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
 *   mandatory markup and {@link AtlasSeoResponse} types it as a string: a blank
 *   one is a page a crawler cannot name at all, which is worse than one named
 *   in the wrong language. The constant also means the endpoint answers the
 *   root on the day it deploys, before any operator has typed anything — the
 *   same role `EMAIL_STRING_DEFAULTS` plays for this global's `emails` group.
 * - **`description` never falls back.** A locale with no description gets
 *   `null`, exactly as a region does, and the host writes its own line in its
 *   own language. An untranslated English sentence in a Dutch site's `<head>`
 *   is worse than no sentence, which is the rule #646 set and this keeps.
 *
 * ## Why the reads step around `clientEnglishFallback`
 *
 * That `afterRead` hook fills blank keys from English for every `clients` read,
 * which is right for widget chrome — a blank button label is a broken UI — and
 * wrong here, where it would silently defeat the `description` rule above. So
 * both reads below pass a **user-less** copy of the request (the hook is scoped
 * to `req.user.collection === 'clients'`) and `fallbackLocale: false`, which
 * turns off Payload's own per-field substitution as well. What comes back is
 * the locale's true copy, and this module decides what an absence means.
 */

import type { PayloadRequest } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import { DEFAULT_LOCALE } from '@/lib/locales'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/**
 * The `<title>` used when no locale, English included, has one on file.
 *
 * Deliberately a name rather than a sentence — it is what the atlas *is*, in
 * the words the widget's own `common.free_meditation_classes` key already uses,
 * so an operator overwriting it is refining copy rather than replacing a
 * placeholder.
 */
export const ROOT_TITLE_FALLBACK = 'Free Meditation Classes'

/** The landing page's copy for one locale. */
export interface RootSeoStrings {
  /** Always a string — see the fallback chain above. */
  title: string
  /** The locale's own description, or `null`. Never English's. */
  description: string | null
}

/** `req.context` key for the per-locale memo of the raw `seo` group. */
function memoKey(locale: string): string {
  return `atlas:rootSeoStrings:${locale}`
}

/** A trimmed non-empty string, or `null` — blank and absent mean the same here. */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * The raw `seo` group for one locale, with every fallback disabled.
 *
 * Never throws: an unreadable global yields `{}`, so the constants above answer
 * the request. A landing page falling back to its default title is a far better
 * outcome than a 500 on somebody else's page render.
 */
async function readSeoGroup(
  req: PayloadRequest,
  locale: LocaleCode,
): Promise<Record<string, unknown>> {
  try {
    const global = await req.payload.findGlobal({
      slug: 'sy-atlas-translations',
      locale,
      fallbackLocale: false,
      depth: 0,
      draft: false,
      overrideAccess: true,
      // A copy, so neither the nested locale nor the dropped user reaches the
      // caller's own request; `context` and `transactionID` still carry over.
      req: { ...req, user: null } as PayloadRequest,
    })
    const group = (global as { seo?: unknown }).seo
    return group && typeof group === 'object' ? (group as Record<string, unknown>) : {}
  } catch (error) {
    req.payload.logger.debug({
      msg: 'atlasSeo: root copy read failed; using defaults',
      locale,
      error: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}

/** The raw `seo` group for one locale, read at most once per request. */
function seoGroup(req: PayloadRequest, locale: LocaleCode): Promise<Record<string, unknown>> {
  return memoizeOnRequest(req, memoKey(locale), () => readSeoGroup(req, locale))
}

/**
 * The landing page's title and description for `locale`.
 *
 * English is read only when the requested locale has no title of its own, so
 * the common case — a translated locale, or English itself — costs one query.
 */
export async function getRootSeoStrings(
  req: PayloadRequest,
  locale: LocaleCode,
): Promise<RootSeoStrings> {
  const group = await seoGroup(req, locale)
  const description = text(group.root_description)
  const title = text(group.root_title)
  if (title) return { title, description }

  const english = locale === DEFAULT_LOCALE ? group : await seoGroup(req, DEFAULT_LOCALE)
  return { title: text(english.root_title) ?? ROOT_TITLE_FALLBACK, description }
}
