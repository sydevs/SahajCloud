/**
 * Pure field mappers for the Atlas Managers import (#462 / #479). Kept side-
 * effect free so they are unit testable without a Payload bootstrap.
 */
import ISO6391 from 'iso-639-1'

import type { NotificationPreferences } from '@/payload-types'

export type ContactPlatform = 'whatsapp' | 'telegram' | 'wechat'

/** Atlas `contactMethod` values that map to a messaging handle (email → none). */
const MESSAGING_PLATFORMS = new Set<string>(['whatsapp', 'telegram', 'wechat'])

/** Atlas notification bits that all fold into the single `regional_summary` type. */
const SUMMARY_FLAGS = ['place_summary', 'country_summary', 'application_summary', 'client_summary']

/**
 * Map Atlas `notifications` flags and `contactMethod` to #462's
 * `notificationPreferences` json. Frequencies follow the MIGRATION_PLAN
 * defaults. The delivery method is the manager's messaging platform, or
 * email if none is set. A "Never" frequency ships with no method, so it
 * passes the field's validator, which requires a method only for
 * non-Never types.
 */
export function mapNotificationPreferences(
  notifications: string[] | null | undefined,
  contactMethod: string | null | undefined,
): NotificationPreferences {
  const flags = new Set(notifications ?? [])
  const method = MESSAGING_PLATFORMS.has(contactMethod ?? '') ? (contactMethod as string) : 'email'
  const pref = (frequency: string) =>
    frequency === 'Never' ? { frequency, method: '' } : { frequency, method }

  const hasSummary = SUMMARY_FLAGS.some((flag) => flags.has(flag))
  return {
    new_responsibility: pref(flags.has('new_managed_record') ? 'Immediate' : 'Never'),
    event_verification: pref('Monthly'),
    event_registration: pref(flags.has('event_registrations') ? 'Immediate' : 'Never'),
    regional_summary: pref(hasSummary ? 'Monthly' : 'Never'),
  }
}

/** The event re-verification cadence a manager's prefs imply (drives nextCheckAt). */
export function managerVerificationCadence(prefs: NotificationPreferences): string {
  return prefs.event_verification?.frequency ?? 'Monthly'
}

/** One `contactDetails` array entry. */
export interface ContactDetail {
  platform: ContactPlatform
  identifier: string
  verified: boolean
}

/**
 * Build `contactDetails` from a messaging `contactMethod` + phone. An `email`
 * contactMethod (or a missing phone) yields no entry — email needs no handle.
 */
export function mapContactDetails(
  contactMethod: string | null | undefined,
  phone: string | null | undefined,
  phoneVerified: boolean | null | undefined,
): ContactDetail[] {
  if (!contactMethod || !MESSAGING_PLATFORMS.has(contactMethod) || !phone?.trim()) return []
  return [
    {
      platform: contactMethod as ContactPlatform,
      identifier: phone.trim(),
      verified: !!phoneVerified,
    },
  ]
}

/**
 * Atlas UPPER language code → a lower two-letter ISO 639-1 code, or undefined
 * when blank/unsupported. The Managers `languageCode`, Events `language`, and
 * Regions/Clients language fields all use `getLanguageOptions()` — the full
 * ISO 639-1 set (value = the 2-letter code) — so we validate against that
 * standard, not the 16 CMS UI locales (which include `pt-br` and exclude
 * `nl`/`fi`/`sl`). Callers needing a required value fall back themselves.
 */
export function mapLanguageCode(code: string | null | undefined): string | undefined {
  const lower = code?.trim().toLowerCase()
  return lower && ISO6391.validate(lower) ? lower : undefined
}
