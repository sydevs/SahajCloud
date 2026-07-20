/**
 * Server-side resolution of the registrant-email copy held in the Sahaj Atlas
 * translations global (`emails` group).
 *
 * Templates receive already-resolved strings as props — a template never issues
 * a `payload.find`, so it stays pure and unit-testable.
 *
 * Two layers of fallback, which cover different failures:
 *
 * 1. **Payload's locale fallback** handles a locale that has never been
 *    translated: the whole JSON field is unset, so Payload substitutes the
 *    English field wholesale.
 * 2. **`EMAIL_STRING_DEFAULTS`** handles the rest — a *partially* translated
 *    locale (Payload falls back per field, not per key, so a blob that exists
 *    but omits a key would otherwise yield `undefined`), a key an editor never
 *    filled in, and a fresh install where the global is empty.
 */

import type { Payload, PayloadRequest } from 'payload'

import { DEFAULT_LOCALE, type LocaleCode } from '@/lib/locales'

/**
 * English source copy, and the last-resort fallback for any key.
 *
 * `%{...}` placeholders match the interpolation convention already used
 * throughout `translationsSchema.json`.
 */
export const EMAIL_STRING_DEFAULTS = {
  confirmation_subject: "You're registered for %{event}",
  confirmation_heading: "You're registered",
  confirmation_intro: 'Hi %{name}, your place is confirmed. Here are the details.',
  when_label: 'When',
  where_label: 'Where',
  online_cta: 'Join the class online',
  online_link_hint: "If the button doesn't work, copy this link into your browser:",
  directions_cta: 'Get Directions',
  about_label: 'What to expect',
  contact_label: 'Your host',
  sessions_count: '%{count} sessions',
  footer_reason: 'You received this email because you registered for this class.',
  footer_website: 'Visit %{name}',
} as const

export type EmailStringKey = keyof typeof EMAIL_STRING_DEFAULTS
export type EmailStrings = Record<EmailStringKey, string>

/** Where the in-flight translations load is stashed on `req.context`. */
const CACHE_KEY = 'registrationEmailStrings'

/**
 * Substitute `%{key}` placeholders. An unknown placeholder is left intact so a
 * copy mistake is visible in the rendered email rather than silently blank.
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/%\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  )
}

/** Merge a raw JSON blob from the global over the English defaults. */
function withDefaults(raw: unknown): EmailStrings {
  const blob = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const resolved = { ...EMAIL_STRING_DEFAULTS } as EmailStrings

  for (const key of Object.keys(EMAIL_STRING_DEFAULTS) as EmailStringKey[]) {
    const value = blob[key]
    if (typeof value === 'string' && value.trim()) resolved[key] = value
  }

  return resolved
}

/**
 * Resolve every registrant-email string for a locale.
 *
 * Never throws: a failed global read logs and yields the English defaults,
 * because a missing translation must not stop a confirmation email from going out.
 *
 * @param locale - Registrant's locale; defaults to `en`.
 * @param req - Forwarded so the read joins the caller's transaction, and so the
 *   per-request memo below is scoped to it.
 */
export async function resolveEmailStrings(args: {
  payload: Payload
  locale?: LocaleCode | null
  req?: PayloadRequest
}): Promise<EmailStrings> {
  const { payload, locale, req } = args
  const targetLocale = locale ?? DEFAULT_LOCALE

  // Memoize the in-flight promise (not the resolved value) per locale. A
  // resolved-value cache stampedes when several sends run concurrently in one
  // request — each clears the "not cached yet" check before the first settles.
  const ctx = (req?.context ?? {}) as Record<string, unknown>
  const cacheKey = `${CACHE_KEY}:${targetLocale}`
  const cached = ctx[cacheKey] as Promise<EmailStrings> | undefined
  if (cached) return cached

  const load = (async () => {
    try {
      const translations = await payload.findGlobal({
        slug: 'sy-atlas-translations',
        locale: targetLocale,
        depth: 0,
        req,
      })
      return withDefaults((translations as { emails?: unknown }).emails)
    } catch (error) {
      payload.logger.debug({
        msg: 'Failed to read sy-atlas-translations emails group; using English defaults',
        locale: targetLocale,
        error,
      })
      return { ...EMAIL_STRING_DEFAULTS } as EmailStrings
    }
  })()

  if (req) {
    ctx[cacheKey] = load
    req.context = ctx
    // Evict on failure so a transient error doesn't poison the rest of the request.
    void load.catch(() => {
      if (ctx[cacheKey] === load) delete ctx[cacheKey]
    })
  }

  return load
}
