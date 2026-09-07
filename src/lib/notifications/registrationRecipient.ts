import type { NotificationChannel } from './types'

import { DEFAULT_REGISTRATION_FREQUENCY } from '@/components/admin/NotificationPreferences/config'
import type { Event, Manager } from '@/payload-types'

import { pickChannel } from './recipients'

/** The event fields the resolver reads — a bare slice, so callers can pass a partial. */
type RegistrationRoutingFields = Pick<
  Event,
  'registrationNotificationEmail' | 'registrationNotificationFrequency'
>

/** A resolved registration-notification target plus its configured cadence. */
export interface RegistrationRecipient {
  /** Email address (override or manager) or a messaging handle (manager pref). */
  destination: string
  /** Display name for the greeting / logs; `null` for a bare override address. */
  name: string | null
  channel: NotificationChannel
  /** The configured cadence — the caller decides whether to send now. */
  frequency: string
}

/**
 * Resolve who a registration notification goes to, and how often.
 *
 * An override address on the event **replaces** the manager (who then gets no
 * copy) and forces the `email` channel — a bare address has no `contactDetails`,
 * so `pickChannel`'s messaging-handle preference can't apply. With no override,
 * the manager is reached via `pickChannel(manager, 'event_registration')`
 * (email, or a messaging handle when configured) at that type's frequency.
 *
 * The frequency is **returned, not acted on**: this is the seam the immediate
 * send and the future digest run share, so each decides for itself which
 * cadences it delivers. Returns `null` only when there is no reachable
 * destination at all (no override, and no manager / no manager destination) —
 * nothing any run could deliver.
 */
export function resolveRegistrationRecipient(
  event: RegistrationRoutingFields,
  manager: Manager | null,
): RegistrationRecipient | null {
  const override = event.registrationNotificationEmail?.trim()
  if (override) {
    return {
      destination: override,
      name: null,
      channel: 'email',
      frequency: event.registrationNotificationFrequency || DEFAULT_REGISTRATION_FREQUENCY,
    }
  }

  if (!manager) return null
  const { channel, destination } = pickChannel(manager, 'event_registration')
  if (!destination) return null

  return {
    destination,
    name: manager.name || manager.email || null,
    channel,
    frequency:
      manager.notificationPreferences?.event_registration?.frequency ||
      DEFAULT_REGISTRATION_FREQUENCY,
  }
}
