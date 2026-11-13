import { describe, expect, it } from 'vitest'

import type {
  NotificationKey,
  NotificationType,
} from '@/components/admin/NotificationPreferences/config'
import {
  buildDefaultNotificationPreferences,
  CONTACT_PLATFORMS,
  DEFAULT_NOTIFICATION_METHOD,
  NOTIFICATION_TYPES,
  notificationFrequency,
  notificationMethodLabel,
  notificationTypesFor,
  REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS,
  validateNotificationPreferences,
} from '@/components/admin/NotificationPreferences/config'

describe('notification preferences config', () => {
  describe('the rows', () => {
    it("applies each row to a role, at a default that is one of the row's own options", () => {
      for (const type of NOTIFICATION_TYPES) {
        expect(type.roles.length).toBeGreaterThan(0)
        expect(type.frequencyOptions).toContain(type.defaultFrequency)
      }
    })
  })

  describe('notificationTypesFor', () => {
    it('gives a program manager their own rows and no admin ones', () => {
      const keys = notificationTypesFor(['program']).map((type) => type.key)
      expect(keys).toContain('event_registration')
      expect(keys).not.toContain('refused_signups')
    })

    it('gives an admin the refused sign-ups row and no per-program ones', () => {
      const keys = notificationTypesFor(['admin']).map((type) => type.key)
      expect(keys).toContain('refused_signups')
      expect(keys).not.toContain('event_verification')
      expect(keys).not.toContain('event_registration')
    })

    it('gives someone holding two roles the union, in declaration order', () => {
      const keys = notificationTypesFor(['program', 'admin']).map((type) => type.key)
      expect(keys).toEqual(NOTIFICATION_TYPES.map((type) => type.key))
    })

    it("gives a service's managers their invitations and open items, nothing about events", () => {
      expect(notificationTypesFor(['service']).map((type) => type.key)).toEqual([
        'invitation',
        'open_items',
      ])
    })

    /** Nothing is assigned yet, so nothing can send them anything. */
    it('gives a manager with no role nothing', () => {
      expect(notificationTypesFor([])).toEqual([])
    })
  })

  describe('notificationFrequency', () => {
    it('reads the stored pace when there is one', () => {
      expect(notificationFrequency({ open_items: { frequency: 'Weekly' } }, 'open_items')).toBe(
        'Weekly',
      )
    })

    /**
     * The column's own DEFAULT reaches new rows only, so every manager who
     * predates a row has no value for it. Each reader falling back for itself
     * is how a job sent daily while the preferences screen showed blank.
     */
    it("falls back to the row's own default for a key nobody saved", () => {
      for (const type of NOTIFICATION_TYPES) {
        expect(notificationFrequency(null, type.key)).toBe(type.defaultFrequency)
        expect(notificationFrequency({}, type.key)).toBe(type.defaultFrequency)
      }
    })

    /**
     * The cast is the case: `NotificationKey` is what stops a reader naming a
     * row that does not exist, and a manager's stored preferences can still
     * carry one the vocabulary has retired.
     */
    it('reads Never for a key nothing declares', () => {
      expect(notificationFrequency({}, 'retired_row' as NotificationKey)).toBe('Never')
    })
  })

  describe('buildDefaultNotificationPreferences', () => {
    it('uses the email method for method-requiring rows', () => {
      const defaults = buildDefaultNotificationPreferences()
      expect(defaults.invitation).toEqual({ frequency: 'Immediate', method: 'email' })
      expect(defaults.event_verification!.method).toBe('email')
    })

    it('ships no method when the default is "Never"', () => {
      const types: NotificationType[] = [
        {
          defaultFrequency: 'Never',
          description: '',
          frequencyOptions: ['Never', 'Daily'],
          key: 'statistics',
          roles: ['program'],
          title: 'Statistics',
        },
      ]
      expect(buildDefaultNotificationPreferences(types)).toEqual({
        statistics: { frequency: 'Never', method: '' },
      })
    })
  })

  /**
   * The override address sends at once or not at all — `SendDigests` skips any
   * event carrying one — so a digest pace chosen there would silently do
   * nothing.
   */
  describe('REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS', () => {
    it('offers no digest pace', () => {
      expect(REGISTRATION_OVERRIDE_FREQUENCY_OPTIONS).toEqual(['Immediate', 'Never'])
    })
  })

  describe('validateNotificationPreferences', () => {
    it('passes for empty/missing values', () => {
      expect(validateNotificationPreferences(undefined)).toBe(true)
      expect(validateNotificationPreferences(null)).toBe(true)
      expect(validateNotificationPreferences({})).toBe(true)
    })

    it('passes when every method-requiring row has a method', () => {
      expect(validateNotificationPreferences(buildDefaultNotificationPreferences())).toBe(true)
    })

    it('does not require a method when frequency is "Never"', () => {
      expect(
        validateNotificationPreferences({
          invitation: { frequency: 'Never', method: '' },
        }),
      ).toBe(true)
    })

    it('names the rows missing a method', () => {
      const result = validateNotificationPreferences({
        event_registration: { frequency: 'Daily', method: '' },
        invitation: { frequency: 'Immediate', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })

      expect(result).toContain('Invitations')
      expect(result).toContain('New registrations')
      expect(result).not.toContain('Statistics')
    })
  })

  describe('notificationMethodLabel', () => {
    it('names email and every platform a manager can list', () => {
      expect(notificationMethodLabel(DEFAULT_NOTIFICATION_METHOD)).toBe('Email')
      for (const platform of CONTACT_PLATFORMS) {
        expect(notificationMethodLabel(platform.value)).toBe(platform.label)
      }
    })

    it('keeps a stored method this vocabulary no longer offers', () => {
      expect(notificationMethodLabel('signal')).toBe('signal')
    })
  })
})
