import { describe, expect, it } from 'vitest'

import type { NotificationType } from '@/components/admin/NotificationPreferences/config'
import {
  buildDefaultNotificationPreferences,
  NOTIFICATION_TYPES,
  validateNotificationPreferences,
} from '@/components/admin/NotificationPreferences/config'

describe('notification preferences config', () => {
  describe('buildDefaultNotificationPreferences', () => {
    it('seeds every configured type with its first frequency option', () => {
      const defaults = buildDefaultNotificationPreferences()

      expect(Object.keys(defaults)).toEqual(NOTIFICATION_TYPES.map((type) => type.key))
      for (const type of NOTIFICATION_TYPES) {
        expect(defaults[type.key].frequency).toBe(type.frequencyOptions[0])
      }
    })

    it('uses the email method for method-requiring types', () => {
      const defaults = buildDefaultNotificationPreferences()
      // None of the shipped types have "Never" as their first option.
      expect(defaults.new_responsibility).toEqual({ frequency: 'Immediate', method: 'email' })
      expect(defaults.event_verification.method).toBe('email')
    })

    it('ships no method when the first option is "Never"', () => {
      const types: NotificationType[] = [
        {
          key: 'optional',
          title: 'Optional',
          description: '',
          frequencyOptions: ['Never', 'Daily'],
        },
      ]
      expect(buildDefaultNotificationPreferences(types)).toEqual({
        optional: { frequency: 'Never', method: '' },
      })
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
          new_responsibility: { frequency: 'Never', method: '' },
        }),
      ).toBe(true)
    })

    it('names the types missing a method', () => {
      const result = validateNotificationPreferences({
        new_responsibility: { frequency: 'Immediate', method: '' },
        event_registration: { frequency: 'Daily Summary', method: '' },
        regional_summary: { frequency: 'Never', method: '' },
      })

      expect(result).toContain('New Responsibility')
      expect(result).toContain('Event Registration')
      expect(result).not.toContain('Regional Summary')
    })
  })
})
