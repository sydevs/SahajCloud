/**
 * Server-side resolution of the email copy held in the Sahaj Atlas translations
 * global (`emails` group) — both the registrant-facing chrome (confirmation,
 * reminder, unsubscribe) and the manager-facing event-verification reminder,
 * which resolve against the recipient's own language.
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
  // Plural family for a limited-run course's session count, selected by
  // `pluralize()` via `Intl.PluralRules`. English needs only `one`/`other`;
  // `few`/`many` are defined so a locale that uses them (ru/uk/cs) still falls
  // back to sensible English when a translator leaves the extra form blank —
  // `withDefaults` fills blanks from these defaults. `%{count}` = the number.
  sessions_count_one: '%{count} session',
  sessions_count_few: '%{count} sessions',
  sessions_count_many: '%{count} sessions',
  sessions_count_other: '%{count} sessions',
  footer_reason: 'You received this email because you registered for this class.',
  footer_website: 'Visit %{name}',
  // Session reminder (sent 24h before an occurrence). Reuses the labels above
  // (when/where/contact/CTAs) and adds only its own chrome.
  reminder_subject: 'Reminder: %{event} is tomorrow',
  reminder_heading: 'Your class is tomorrow',
  reminder_intro: 'Hi %{name}, a quick reminder about your upcoming class.',
  reminder_footer_reason: 'You received this reminder because you registered for this class.',
  unsubscribe_cta: 'Unsubscribe from these reminders',
  // Unsubscribe landing page, rendered in the registration's stored locale.
  unsubscribe_heading: 'Unsubscribe from reminders',
  unsubscribe_intro:
    'Stop receiving reminder emails for %{event}? You will stay registered — only the reminders stop.',
  unsubscribe_confirm_cta: 'Unsubscribe',
  unsubscribe_working: 'Unsubscribing…',
  unsubscribe_done_title: 'You have been unsubscribed',
  unsubscribe_done_message:
    'You will not receive any more reminders for this class. You are still registered.',
  unsubscribe_error_title: 'Something went wrong',
  unsubscribe_error_message:
    'We could not process your request. Please try again in a little while.',

  // ───────────────────────────────────────────────────────────────────────
  // Event verification reminder (manager-facing, `EventVerificationEmail`).
  //
  // The `verify_<audience>_<level>_<slot>` matrix holds one variation's whole
  // wording. `audience` is the recipient — the event's own `manager`, or a
  // `region` manager escalated to above them; `level` is the escalation stage.
  // The matrix is deliberately ragged: region managers are first looped in at
  // `escalated`, so there is no `verify_region_due_*` family.
  // ───────────────────────────────────────────────────────────────────────
  verify_greeting: 'Hello %{name},',
  verify_button_hint: 'If the button doesn’t work, copy and paste this link into your browser:',
  verify_footer_manager:
    'You’re receiving this because you manage this event on %{brand}. The links in this email are unique to you and act on your behalf — please don’t forward this email.',
  verify_footer_region:
    'You’re receiving this because you manage this region on %{brand}. The links in this email are unique to you and act on your behalf — please don’t forward this email.',
  // The pre-filled email a region manager's "Contact manager" button opens.
  verify_contact_subject: 'Please verify your Sahaja Yoga class: %{event}',
  verify_contact_body:
    'Hello %{manager},\n\nYour event “%{event}” is going to be automatically unpublished soon if we don’t check it. Could you verify it from your reminder email, or let me know if it is no longer running?\n\nThank you.',

  // Summary tables — section headings and row labels.
  verify_manager_heading: 'Event manager',
  verify_details_heading: 'Event details',
  verify_label_name: 'Name',
  verify_label_event: 'Event',
  verify_label_online: 'Online',
  verify_label_address: 'Address',
  verify_label_schedule: 'Schedule',
  verify_label_breaks: 'Scheduled breaks',
  verify_label_contact: 'Contact',
  verify_label_registrations: 'Registrations',
  verify_label_last_verified: 'Last verified',
  verify_never_verified: 'Never',
  verify_view_event_cta: 'View event',
  // Plural family for the recent-registration count; see `pluralize()`.
  verify_registrations_count_one: '%{count} registration in the last 30 days',
  verify_registrations_count_few: '%{count} registrations in the last 30 days',
  verify_registrations_count_many: '%{count} registrations in the last 30 days',
  verify_registrations_count_other: '%{count} registrations in the last 30 days',

  // Stand-ins for a value the reminder couldn't resolve.
  verify_fallback_manager: 'the event manager',
  verify_fallback_region: 'your region',
  verify_fallback_deadline: 'shortly',

  verify_manager_due_subject: 'Please verify your event: %{event}',
  verify_manager_due_heading: 'Verify your Sahaja Yoga class',
  verify_manager_due_preview: 'A quick check that your class is still running.',
  verify_manager_due_cta: 'Verify this event',
  verify_manager_due_body:
    'To keep public listings accurate, %{brand} events need to be checked periodically. Events which are not verified are automatically unpublished. Please verify the details of your class below.',
  verify_manager_due_callout: '✅ Verify by %{deadline} to keep this event published.',

  verify_manager_escalated_subject: 'Action needed — verify your event: %{event}',
  verify_manager_escalated_heading: 'Sahaja Yoga class still needs verification',
  verify_manager_escalated_preview: 'Your event is overdue for verification.',
  verify_manager_escalated_cta: 'Verify now',
  verify_manager_escalated_body:
    'This is a reminder that your event still needs verification. Please check the details below and verify now.',
  verify_manager_escalated_callout: '⏰ Verify by %{deadline} or this event will be unpublished.',

  verify_manager_urgent_subject: 'Final reminder — verify your event: %{event}',
  verify_manager_urgent_heading: 'Final reminder: verify your Sahaja Yoga class',
  verify_manager_urgent_preview: 'Last reminder before your class is unpublished.',
  verify_manager_urgent_cta: 'Verify now',
  verify_manager_urgent_body:
    'This is the final reminder to verify your event. Please check the details below and verify it immediately.',
  verify_manager_urgent_callout:
    '⚠️ Final reminder — verify by %{deadline} or this event will be unpublished.',

  verify_manager_expired_subject: 'Your event has been unpublished: %{event}',
  verify_manager_expired_heading: 'Your Sahaja Yoga class has been unpublished',
  verify_manager_expired_preview: 'Your unverified event is now hidden from the public.',
  verify_manager_expired_cta: 'Verify to restore',
  verify_manager_expired_body:
    'Your event wasn’t verified in over %{since}, so it has been hidden from the public. If this event is still running, please verify the details below to immediately republish the event.',
  verify_manager_expired_callout: '🚫 Unpublished on %{deadline}. Verify now to republish.',

  verify_region_escalated_subject: 'Needs verification — an event in your region: %{event}',
  verify_region_escalated_heading: 'Event manager not responding',
  verify_region_escalated_preview: 'Please contact the event manager to verify their event.',
  verify_region_escalated_cta: 'Contact manager',
  verify_region_escalated_body:
    'The following event in %{region} needs verification, but the event manager has not yet responded. Please reach out to %{manager} and confirm if it’s still running.',
  verify_region_escalated_callout:
    '⏰ Contact the manager. They must verify by %{deadline} or this event will be unpublished.',

  verify_region_urgent_subject: 'Final notice — an event in your region: %{event}',
  verify_region_urgent_heading: 'Event will soon be unpublished',
  verify_region_urgent_preview: 'Last notice before an event in your region is unpublished.',
  verify_region_urgent_cta: 'Contact manager',
  verify_region_urgent_body:
    'An event in %{region} still needs verification, and its manager hasn’t responded to earlier reminders. Please get in touch with %{manager} to check on it.',
  verify_region_urgent_callout:
    '⚠️ Final notice — contact the manager. They must verify by %{deadline} or this event will be unpublished.',

  verify_region_expired_subject: 'Unpublished — an event in your region: %{event}',
  verify_region_expired_heading: 'Event has been unpublished',
  verify_region_expired_preview: 'An unverified event in your region is now hidden.',
  verify_region_expired_cta: 'Contact manager',
  verify_region_expired_body:
    'An event in %{region} was unpublished after going unverified for %{since}. If it’s still running, please contact %{manager} and ask them to verify the event.',
  verify_region_expired_callout: '🚫 Unpublished on %{deadline}. Contact the manager to republish.',
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

/**
 * Select and interpolate the correct plural form of a string for `count`.
 *
 * Plural keys follow the `_one` / `_few` / `_many` / `_other` convention (the
 * CLDR categories). `Intl.PluralRules` — the platform's own CLDR data — picks
 * the category for the locale + count (Russian 2 → `few`, 5 → `many`; Czech
 * 5 → `other`), so no per-language plural logic is hardcoded here. The resolved
 * `<baseKey>_<category>` is used, falling back to `<baseKey>_other` for any
 * category the strings don't define. `resolveEmailStrings` has already filled
 * blank keys from the English defaults, so `_other` always resolves.
 *
 * @param strings - Resolved email strings for the locale.
 * @param baseKey - Plural key stem, e.g. `sessions_count`.
 * @param count - Quantity selecting the form; also supplied as `%{count}`.
 * @param locale - BCP-47 locale driving CLDR selection; defaults to `en`.
 * @param values - Extra `%{...}` substitutions, merged over `{ count }`.
 */
export function pluralize(
  strings: EmailStrings,
  baseKey: string,
  count: number,
  locale?: LocaleCode | null,
  values?: Record<string, string | number>,
): string {
  const category = new Intl.PluralRules(locale ?? DEFAULT_LOCALE).select(count)
  const lookup = strings as Record<string, string | undefined>
  const template = lookup[`${baseKey}_${category}`] ?? lookup[`${baseKey}_other`] ?? ''
  return interpolate(template, { count, ...values })
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
