import { describe, expect, it } from 'vitest'

import {
  managerVerificationCadence,
  mapContactDetails,
  mapLanguageCode,
  mapNotificationPreferences,
} from '../../seeds/atlas/helpers/managerMapper'

describe('mapNotificationPreferences', () => {
  it('maps enabled flags to frequencies with the contact method', () => {
    const prefs = mapNotificationPreferences(
      ['new_managed_record', 'event_registrations'],
      'whatsapp',
    )
    expect(prefs).toEqual({
      new_responsibility: { frequency: 'Immediate', method: 'whatsapp' },
      event_verification: { frequency: 'Monthly', method: 'whatsapp' },
      event_registration: { frequency: 'Immediate', method: 'whatsapp' },
      regional_summary: { frequency: 'Never', method: '' },
    })
  })

  it('defaults the method to email and turns off unset flags', () => {
    const prefs = mapNotificationPreferences([], 'email')
    expect(prefs.new_responsibility).toEqual({ frequency: 'Never', method: '' })
    // Verification is always on (monthly re-verification by default).
    expect(prefs.event_verification).toEqual({ frequency: 'Monthly', method: 'email' })
    expect(prefs.event_registration).toEqual({ frequency: 'Never', method: '' })
    expect(prefs.regional_summary).toEqual({ frequency: 'Never', method: '' })
  })

  it('folds any *_summary flag into a monthly regional_summary', () => {
    expect(mapNotificationPreferences(['country_summary'], null).regional_summary).toEqual({
      frequency: 'Monthly',
      method: 'email',
    })
    expect(mapNotificationPreferences(['client_summary'], null).regional_summary.frequency).toBe(
      'Monthly',
    )
  })
})

describe('managerVerificationCadence', () => {
  it('returns the event_verification frequency', () => {
    expect(managerVerificationCadence(mapNotificationPreferences([], 'email'))).toBe('Monthly')
  })
})

describe('mapContactDetails', () => {
  it('builds a messaging handle for whatsapp/telegram/wechat', () => {
    expect(mapContactDetails('whatsapp', '+64 22 303 9918', true)).toEqual([
      { platform: 'whatsapp', identifier: '+64 22 303 9918', verified: true },
    ])
  })

  it('returns none for email or a missing phone', () => {
    expect(mapContactDetails('email', '+123', true)).toEqual([])
    expect(mapContactDetails('telegram', null, false)).toEqual([])
    expect(mapContactDetails('telegram', '  ', false)).toEqual([])
  })
})

describe('mapLanguageCode', () => {
  it('lowercases a supported code', () => {
    expect(mapLanguageCode('DE')).toBe('de')
    expect(mapLanguageCode('EN')).toBe('en')
  })

  it('aliases PT to the only Portuguese locale', () => {
    expect(mapLanguageCode('PT')).toBe('pt-br')
  })

  it('returns undefined for blank or unsupported codes', () => {
    expect(mapLanguageCode(null)).toBeUndefined()
    expect(mapLanguageCode('')).toBeUndefined()
    expect(mapLanguageCode('SL')).toBeUndefined() // Slovenian — not a CMS locale
    expect(mapLanguageCode('FI')).toBeUndefined() // Finnish — not a CMS locale
  })
})
