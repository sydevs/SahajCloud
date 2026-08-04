import { describe, expect, it } from 'vitest'

import { resolveRegistrationRecipient } from '@/lib/notifications/registrationRecipient'
import type { Event, Manager } from '@/payload-types'

/** Minimal Event slice the resolver reads. */
function event(
  overrides: Partial<
    Pick<Event, 'registrationNotificationEmail' | 'registrationNotificationFrequency'>
  > = {},
): Pick<Event, 'registrationNotificationEmail' | 'registrationNotificationFrequency'> {
  return {
    registrationNotificationEmail: null,
    registrationNotificationFrequency: null,
    ...overrides,
  }
}

/**
 * Minimal Manager with only the fields the resolver / pickChannel read.
 *
 * `notificationPreferences` is widened with `| null`: the field's `jsonSchema`
 * types it, and Payload's type-gen doesn't add `| null` to a jsonSchema-typed
 * field — but a manager row that has never been given preferences really does
 * read back null, which is exactly the fallback these cases exercise.
 */
function manager(
  overrides: Partial<Omit<Manager, 'notificationPreferences'>> & {
    notificationPreferences?: Manager['notificationPreferences'] | null
  } = {},
): Manager {
  return {
    id: 1,
    name: 'Anna Manager',
    email: 'anna@example.com',
    ...overrides,
  } as unknown as Manager
}

describe('resolveRegistrationRecipient', () => {
  describe('override address', () => {
    it('routes to the override address and forces the email channel', () => {
      const result = resolveRegistrationRecipient(
        event({
          registrationNotificationEmail: 'ops@example.org',
          registrationNotificationFrequency: 'Immediate',
        }),
        // A messaging-preferring manager is ignored — the override wins and is email-only.
        manager({
          notificationPreferences: {
            event_registration: { frequency: 'Immediate', method: 'whatsapp' },
          },
          contactDetails: [{ platform: 'whatsapp', identifier: '+15550001' }],
        } as Partial<Manager>),
      )
      expect(result).toEqual({
        destination: 'ops@example.org',
        name: null,
        channel: 'email',
        frequency: 'Immediate',
      })
    })

    it('carries the event frequency (Never) through without acting on it', () => {
      const result = resolveRegistrationRecipient(
        event({
          registrationNotificationEmail: 'ops@example.org',
          registrationNotificationFrequency: 'Never',
        }),
        null,
      )
      expect(result?.frequency).toBe('Never')
      expect(result?.destination).toBe('ops@example.org')
    })

    it('defaults the frequency to Immediate when the override has none', () => {
      const result = resolveRegistrationRecipient(
        event({ registrationNotificationEmail: 'ops@example.org' }),
        null,
      )
      expect(result?.frequency).toBe('Immediate')
    })

    it('trims surrounding whitespace on the override address', () => {
      const result = resolveRegistrationRecipient(
        event({ registrationNotificationEmail: '  ops@example.org  ' }),
        null,
      )
      expect(result?.destination).toBe('ops@example.org')
    })

    it('treats a blank/whitespace override as unset and falls back to the manager', () => {
      const result = resolveRegistrationRecipient(
        event({ registrationNotificationEmail: '   ' }),
        manager(),
      )
      expect(result?.destination).toBe('anna@example.com')
      expect(result?.name).toBe('Anna Manager')
    })
  })

  describe('manager fallback (no override)', () => {
    it('routes to the manager email at the event_registration frequency', () => {
      const result = resolveRegistrationRecipient(
        event(),
        manager({
          notificationPreferences: {
            event_registration: { frequency: 'Immediate', method: 'email' },
          },
        } as Partial<Manager>),
      )
      expect(result).toEqual({
        destination: 'anna@example.com',
        name: 'Anna Manager',
        channel: 'email',
        frequency: 'Immediate',
      })
    })

    it('resolves a messaging handle when the method is whatsapp', () => {
      const result = resolveRegistrationRecipient(
        event(),
        manager({
          notificationPreferences: {
            event_registration: { frequency: 'Immediate', method: 'whatsapp' },
          },
          contactDetails: [{ platform: 'whatsapp', identifier: '+15550002' }],
        } as Partial<Manager>),
      )
      expect(result?.channel).toBe('whatsapp')
      expect(result?.destination).toBe('+15550002')
    })

    it('falls back to email when the whatsapp method has no handle on file', () => {
      const result = resolveRegistrationRecipient(
        event(),
        manager({
          notificationPreferences: {
            event_registration: { frequency: 'Immediate', method: 'whatsapp' },
          },
          contactDetails: [],
        } as Partial<Manager>),
      )
      expect(result?.channel).toBe('email')
      expect(result?.destination).toBe('anna@example.com')
    })

    it('returns a summary frequency verbatim (the caller, not the resolver, defers it)', () => {
      const result = resolveRegistrationRecipient(
        event(),
        manager({
          notificationPreferences: {
            event_registration: { frequency: 'Daily Summary', method: 'email' },
          },
        } as Partial<Manager>),
      )
      expect(result?.frequency).toBe('Daily Summary')
    })

    it('defaults the frequency to Immediate when the manager has no preference', () => {
      const result = resolveRegistrationRecipient(
        event(),
        manager({ notificationPreferences: null }),
      )
      expect(result?.frequency).toBe('Immediate')
    })

    it('uses the email as the display name when the manager name is empty', () => {
      const result = resolveRegistrationRecipient(
        event(),
        manager({ name: '' } as Partial<Manager>),
      )
      expect(result?.name).toBe('anna@example.com')
    })
  })

  describe('no reachable destination', () => {
    it('returns null with no override and no manager', () => {
      expect(resolveRegistrationRecipient(event(), null)).toBeNull()
    })

    it('returns null when the manager has no email (default channel)', () => {
      const result = resolveRegistrationRecipient(
        event(),
        manager({ email: '' } as Partial<Manager>),
      )
      expect(result).toBeNull()
    })
  })
})
