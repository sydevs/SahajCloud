/**
 * Configuration + pure helpers for the NotificationPreferences field.
 *
 * `NOTIFICATION_TYPES` is passed to the field component via `admin.custom`
 * (see Managers.ts) — the component renders one row per type and adapts
 * entirely from this config, so adding/removing a type needs no component
 * change. The helpers are pure (no React, no Payload) so they can be reused
 * by the field's `defaultValue`/`validate` and unit-tested directly.
 */
import type { JSONSchema4 } from 'json-schema'

export const NEVER_FREQUENCY = 'Never'
export const DEFAULT_NOTIFICATION_METHOD = 'email'

export interface NotificationType {
  key: string
  title: string
  description: string
  frequencyOptions: string[]
}

export interface NotificationPreference {
  frequency: string
  method: string
}

/** Stored JSON shape: `{ [key]: { frequency, method } }`. */
export type NotificationPreferencesValue = Record<string, NotificationPreference>

export const NOTIFICATION_PREFERENCES_SCHEMA_URI =
  'https://sahajcloud.dev/schemas/notification-preferences.json'

export const NOTIFICATION_TYPES: NotificationType[] = [
  {
    key: 'new_responsibility',
    title: 'New Responsibility',
    description: "Sent when you're given access to a new region or event to manage",
    frequencyOptions: ['Immediate', NEVER_FREQUENCY],
  },
  {
    key: 'event_verification',
    title: 'Event Verification',
    description: 'Sent regularly to verify the status of events you manage',
    frequencyOptions: ['Monthly', '3 Months', '6 Months'],
  },
  {
    key: 'event_registration',
    title: 'Event Registration',
    description: 'Sent when seekers register for an event you manage',
    frequencyOptions: ['Immediate', 'Daily Summary', 'Weekly Summary', NEVER_FREQUENCY],
  },
  {
    key: 'regional_summary',
    title: 'Regional Summary',
    description: 'Sent regularly about the status of regions you manage',
    frequencyOptions: ['Monthly', NEVER_FREQUENCY],
  },
]

/**
 * The frequency options for one notification type, from the single source of
 * truth above. Lets other surfaces (the per-event registration-notification
 * fields in `Events.ts`) derive their choices instead of re-listing literals
 * that could drift from `NOTIFICATION_TYPES`.
 */
export function getFrequencyOptions(key: string): string[] {
  return NOTIFICATION_TYPES.find((type) => type.key === key)?.frequencyOptions ?? []
}

/**
 * Frequencies whose delivery is a scheduled digest run rather than an immediate
 * send. Not yet built — the digest ticket follows #588 — so the per-event
 * override select omits them (a manager can't pick a cadence that silently does
 * nothing). Delete the omission once digests ship.
 */
export const SUMMARY_FREQUENCIES = ['Daily Summary', 'Weekly Summary']

/**
 * Cadence options for the per-event `registrationNotificationEmail` override.
 * Derived from `event_registration` minus the not-yet-delivered summaries, so
 * every selectable option acts immediately and deterministically today:
 * `Immediate` sends now, `Never` never sends.
 */
export const REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS = getFrequencyOptions(
  'event_registration',
).filter((frequency) => !SUMMARY_FREQUENCIES.includes(frequency))

/**
 * Fallback cadence when an override address is set but no frequency is chosen.
 * The first `event_registration` option (`Immediate`), matching
 * `buildDefaultNotificationPreferences`.
 */
export const DEFAULT_REGISTRATION_FREQUENCY =
  getFrequencyOptions('event_registration')[0] ?? 'Immediate'

/**
 * Seed value for a fresh manager: every type defaults to its first frequency
 * option with the `email` method (which needs no contactDetails). A type
 * whose first option is "Never" ships with no method.
 */
export function buildDefaultNotificationPreferences(
  types: NotificationType[] = NOTIFICATION_TYPES,
): NotificationPreferencesValue {
  const prefs: NotificationPreferencesValue = {}
  for (const type of types) {
    const frequency = type.frequencyOptions[0] ?? NEVER_FREQUENCY
    prefs[type.key] = {
      frequency,
      method: frequency === NEVER_FREQUENCY ? '' : DEFAULT_NOTIFICATION_METHOD,
    }
  }
  return prefs
}

/**
 * The stored shape, derived from `NOTIFICATION_TYPES` so a new notification
 * type cannot leave the schema behind. Wired onto `Managers.notificationPreferences`
 * as its `jsonSchema`, which both generates the TypeScript type and rejects a
 * key no notification type claims.
 *
 * Neither inner key is required. `buildDefaultNotificationPreferences` writes
 * both, but Payload validates this column on every save of a manager, and a row
 * seeded before a key existed must stay saveable. The frequency is checked as a
 * string rather than against `frequencyOptions` for the same reason — dropping
 * an option would otherwise strand every manager still on it.
 */
export const notificationPreferencesJsonSchema: JSONSchema4 = {
  $id: NOTIFICATION_PREFERENCES_SCHEMA_URI,
  title: 'NotificationPreferences',
  type: 'object',
  additionalProperties: false,
  properties: Object.fromEntries(
    NOTIFICATION_TYPES.map((type) => [
      type.key,
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          frequency: { type: 'string', description: type.frequencyOptions.join(' | ') },
          method: { type: 'string' },
        },
      },
    ]),
  ),
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

  const prefs = value as NotificationPreferencesValue
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
