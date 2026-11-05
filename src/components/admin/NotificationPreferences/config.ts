/**
 * Configuration + pure helpers for the NotificationPreferences field.
 *
 * `NOTIFICATION_TYPES` is passed to the field component via `admin.custom`
 * (see Managers.ts) — the component renders one row per type and adapts
 * entirely from this config, so adding/removing a type needs no component
 * change. The helpers are pure (no React, no Payload) so they can be reused
 * by the field's `defaultValue`/`validate` and unit-tested directly.
 *
 * ⚠ **Keep this module free of runtime imports.** `NotificationPreferencesField`
 * is a `'use client'` component and value-imports from here, so anything added
 * at the top level lands in an admin browser chunk. The column's `jsonSchema`
 * lives beside its field in `Managers.ts` for that reason — declaring it here
 * would ship `zod` and a `toJSONSchema` call to the browser to describe a shape
 * only the server validates. `ManagerRole` is a type-only import, so it is
 * erased.
 */
import type { ManagerRole } from '@/lib/notifications/managerRoles'
import type { NotificationPreferences } from '@/payload-types'

export const NEVER_FREQUENCY = 'Never'
export const DEFAULT_NOTIFICATION_METHOD = 'email'

export interface NotificationType {
  key: string
  title: string
  description: string
  frequencyOptions: string[]
  /**
   * The pace a manager who never saved this row is on.
   *
   * ⚠ **Not `frequencyOptions[0]`.** The two agree for most rows and must not
   * be collapsed: `new_proposals` offers Immediate first, because a proposal
   * someone is waiting on is worth the interruption if you want it, and still
   * defaults to Daily, because most managers do not.
   */
  defaultFrequency: string
  /** Which roles the row applies to — a manager holding none never sees it. */
  roles: readonly ManagerRole[]
}

const EVERYONE: readonly ManagerRole[] = ['program', 'region', 'admin']

/**
 * One flat list of seven rows, with no role headings.
 *
 * ⚠ **A row is shown by role, not by heading.** Grouping them under "Program
 * manager" / "Region manager" asks a reader to work out which of those they are
 * — and one manager is often two of them. `roles` does that filtering instead,
 * so each manager sees the rows that can actually send them something.
 */
export const NOTIFICATION_TYPES: NotificationType[] = [
  {
    key: 'invitation',
    title: 'Invitations',
    description: "Sent when you're invited to look after a new role, region, event or page",
    frequencyOptions: ['Immediate', NEVER_FREQUENCY],
    defaultFrequency: 'Immediate',
    roles: EVERYONE,
  },
  {
    key: 'event_verification',
    title: 'Re-verification period',
    description: 'How often we ask you to confirm the details of the programs you run',
    frequencyOptions: ['Monthly', '3 Months', '6 Months'],
    defaultFrequency: 'Monthly',
    roles: ['program'],
  },
  {
    key: 'event_registration',
    title: 'New registrations',
    description: 'Sent when seekers sign up for a program you run',
    frequencyOptions: ['Immediate', 'Daily', 'Weekly', NEVER_FREQUENCY],
    defaultFrequency: 'Daily',
    roles: ['program'],
  },
  {
    key: 'new_proposals',
    title: 'New proposals',
    description: 'Sent when a visitor proposes a new class, or a change to one',
    frequencyOptions: ['Immediate', 'Daily', 'Weekly', 'Monthly'],
    defaultFrequency: 'Daily',
    roles: EVERYONE,
  },
  {
    key: 'open_items',
    title: 'Open items',
    description: 'A summary of everything waiting for you, most urgent first',
    frequencyOptions: ['Weekly', 'Monthly', NEVER_FREQUENCY],
    defaultFrequency: 'Monthly',
    roles: EVERYONE,
  },
  {
    key: 'refused_signups',
    title: 'Refused sign-ups',
    description: 'Sent when the spam check refuses a class sign-up',
    frequencyOptions: ['Daily', 'Weekly', 'Monthly', NEVER_FREQUENCY],
    defaultFrequency: 'Daily',
    roles: ['admin'],
  },
  {
    key: 'statistics',
    title: 'Statistics',
    description: 'How your programs and regions are doing, and what changed',
    frequencyOptions: ['Monthly', NEVER_FREQUENCY],
    defaultFrequency: 'Monthly',
    roles: EVERYONE,
  },
]

/** One notification type by key, or nothing for a key nothing declares. */
export function notificationType(key: string): NotificationType | undefined {
  return NOTIFICATION_TYPES.find((type) => type.key === key)
}

/**
 * The frequency options for one notification type, from the single source of
 * truth above. Lets other surfaces (the per-event registration-notification
 * fields in `Events.ts`) derive their choices instead of re-listing literals
 * that could drift from `NOTIFICATION_TYPES`.
 */
export function getFrequencyOptions(key: string): string[] {
  return notificationType(key)?.frequencyOptions ?? []
}

/**
 * The rows one manager sees, in declaration order.
 *
 * A manager holding no role at all — a fresh account with nothing assigned —
 * sees nothing, which is honest: nothing can send them anything yet.
 */
export function notificationTypesFor(
  roles: readonly ManagerRole[],
  types: NotificationType[] = NOTIFICATION_TYPES,
): NotificationType[] {
  return types.filter((type) => type.roles.some((role) => roles.includes(role)))
}

/**
 * The pace a manager is on for one key.
 *
 * ⚠ **The one resolver, read by the field, the digest job and
 * `deliverProposal`.** The column's own DEFAULT reaches new rows only, so every
 * manager who predates a row — or whose stored preferences were written before
 * it existed — has no value for it at all. Each reader falling back for itself
 * is how a job sent daily while the preferences screen showed blank (#1052's
 * Medium finding); a key nothing declares has no default, and reads as `Never`.
 */
export function notificationFrequency(
  preferences: NotificationPreferences | null | undefined,
  key: string,
  types: NotificationType[] = NOTIFICATION_TYPES,
): string {
  const stored = preferences?.[key]?.frequency
  if (stored) return stored
  return types.find((type) => type.key === key)?.defaultFrequency ?? NEVER_FREQUENCY
}

/**
 * Frequencies whose delivery is a scheduled digest run rather than an immediate
 * send (#588, shipped in #589). The per-event override select omits them
 * because `SendDigests` skips any event carrying an override address, so a
 * summary cadence chosen there would silently do nothing.
 */
export const SUMMARY_FREQUENCIES = ['Daily', 'Weekly', 'Monthly']

/**
 * Cadence options for the per-event `registrationNotificationEmail` override.
 * Derived from `event_registration` minus the summary cadences, so every
 * selectable option acts immediately and deterministically here: `Immediate`
 * sends now, `Never` never sends.
 */
export const REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS = getFrequencyOptions(
  'event_registration',
).filter((frequency) => !SUMMARY_FREQUENCIES.includes(frequency))

/**
 * Fallback cadence when an override address is set but no frequency is chosen.
 * `Immediate`, the only non-summary pace an override may carry.
 */
export const DEFAULT_REGISTRATION_FREQUENCY =
  REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS[0] ?? 'Immediate'

/**
 * Seed value for a fresh manager: every row at its own default, with the
 * `email` method (which needs no contactDetails). A row defaulting to "Never"
 * ships with no method.
 */
export function buildDefaultNotificationPreferences(
  types: NotificationType[] = NOTIFICATION_TYPES,
): NotificationPreferences {
  const prefs: NotificationPreferences = {}
  for (const type of types) {
    const frequency = type.defaultFrequency
    prefs[type.key] = {
      frequency,
      method: frequency === NEVER_FREQUENCY ? '' : DEFAULT_NOTIFICATION_METHOD,
    }
  }
  return prefs
}

/**
 * Every configured preference requires a delivery method unless its frequency
 * is "Never". Returns an error message naming the offending types, or `true`.
 *
 * This is a cross-key rule the JSON Schema cannot state, so it stays a custom
 * `validate` — composed with the built-in one at the call site, never replacing
 * it (see `Managers.notificationPreferences`).
 */
export function validateNotificationPreferences(
  value: unknown,
  types: NotificationType[] = NOTIFICATION_TYPES,
): true | string {
  if (!value || typeof value !== 'object') return true

  const prefs = value as NotificationPreferences
  const titleByKey = new Map(types.map((type) => [type.key, type.title]))
  const missing: string[] = []

  for (const [key, pref] of Object.entries(prefs)) {
    if (!pref) continue
    if (pref.frequency && pref.frequency !== NEVER_FREQUENCY && !pref.method) {
      missing.push(titleByKey.get(key) ?? key)
    }
  }

  if (missing.length > 0) {
    return `Select a notification method for: ${missing.join(', ')}`
  }
  return true
}
