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

import type { NotificationPreferences } from '@/payload-types'

export const NEVER_FREQUENCY = 'Never'
export const DEFAULT_NOTIFICATION_METHOD = 'email'

export interface NotificationType {
  key: string
  title: string
  description: string
  frequencyOptions: string[]
}

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
): NotificationPreferences {
  const prefs: NotificationPreferences = {}
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
 * The stored shape, wired onto `Managers.notificationPreferences` as its
 * `jsonSchema` — which both generates the TypeScript type and rejects a
 * preference whose frequency or method is not a string.
 *
 * **Open keys, typed value.** Every key is a notification-type key, and
 * retiring a type must not block a save: Payload validates this column on every
 * save of a manager, and the field component spreads an unknown key back, so a
 * closed shape would strand the row rather than let the admin clear it. Saying
 * what the *value* holds costs nothing and is what makes the generated
 * interface usable — `additionalProperties: true` generates
 * `[k: string]: unknown`, which is why every consumer reading
 * `prefs[key]?.method` used to need a hand-written alias to cast to. That alias
 * is the second definition #659 exists to delete.
 *
 * **There are deliberately no per-key `properties`.** They validated exactly
 * what this does, differing only in a `description`, and TypeScript refuses the
 * combination: an optional named property includes `undefined`, which is not
 * assignable to an index signature that does not, so `payload-types.ts` itself
 * fails `tsc` with TS2411. Requiring the four keys would fix the assignability
 * and strand every row missing one. `NOTIFICATION_TYPES` stays the source of
 * truth for which keys the admin renders, and the frequency is checked as a
 * string rather than against `frequencyOptions` — dropping an option would
 * otherwise strand every manager still on it.
 */
export const notificationPreferencesJsonSchema: JSONSchema4 = {
  $id: NOTIFICATION_PREFERENCES_SCHEMA_URI,
  title: 'NotificationPreferences',
  // Stays `'object'`. `type: ['object', 'null']` is the honest statement — the
  // column is nullable — and it works on a schema with no `properties`
  // (`meditationNodeWeightsFieldSchema`). Here it emits `X & (X | null)`, which
  // is `X` again plus a duplicate of the whole interface. See
  // `src/collections/AGENTS.md`.
  type: 'object',
  additionalProperties: {
    type: 'object',
    // The value stays open for the same reason the keys do.
    additionalProperties: true,
    properties: {
      frequency: { type: 'string' },
      method: { type: 'string' },
    },
  },
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
