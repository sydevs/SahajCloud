/**
 * Configuration + pure helpers for the NotificationPreferences field.
 *
 * `NOTIFICATION_TYPES` is passed to the field component via `admin.custom`
 * (see Managers.ts) — the component renders one row per type and adapts
 * entirely from this config, so adding/removing a type needs no component
 * change. The helpers are pure (no React, no Payload) so they can be reused
 * by the field's `defaultValue`/`validate` and unit-tested directly.
 */

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
 * Every configured preference requires a delivery method unless its frequency
 * is "Never". Returns an error message naming the offending types, or `true`.
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
