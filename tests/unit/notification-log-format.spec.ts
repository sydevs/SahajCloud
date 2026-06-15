import { describe, expect, it } from 'vitest'

import {
  deliveryCell,
  eventLabel,
  formatLogDate,
  whoCell,
} from '@/components/admin/NotificationLogTable/format'
import type { NotificationLogEntry } from '@/lib/eventVerification/log'

const verification: NotificationLogEntry = {
  kind: 'verification',
  at: '2026-06-13T14:30:00.000Z',
  by: { id: 7, name: 'Priya Deshmukh' },
  method: 'email-link',
}

const managerReminder: NotificationLogEntry = {
  kind: 'reminder',
  stage: 'verified',
  level: 'due',
  role: 'manager',
  at: '2026-06-13T14:30:00.000Z',
  manager: { id: 7, name: 'Priya Deshmukh' },
  channel: 'email',
  destination: 'priya@example.com',
}

const regionReminder: NotificationLogEntry = {
  kind: 'reminder',
  stage: 'reminded',
  level: 'escalated',
  role: 'region',
  region: 'Maharashtra',
  at: '2026-06-13T14:30:00.000Z',
  manager: { id: 9, name: 'Rohan Patil' },
  channel: 'email',
  destination: 'rohan@example.com',
}

describe('notification-log format', () => {
  describe('formatLogDate', () => {
    it('renders the date in words with the time', () => {
      const out = formatLogDate('2026-06-13T14:30:00.000Z')
      expect(out).toContain('June')
      expect(out).toContain('2026')
      expect(out).toMatch(/\b13\b/)
      expect(out).toMatch(/\d{2}:\d{2}/)
    })

    it('returns the raw value for an unparseable date', () => {
      expect(formatLogDate('not-a-date')).toBe('not-a-date')
    })
  })

  describe('eventLabel (no internal stage shown)', () => {
    it('labels a verification', () => {
      expect(eventLabel(verification)).toBe('Verified')
    })

    it('labels reminders by escalation level, not stage', () => {
      expect(eventLabel(managerReminder)).toBe('Reminder')
      expect(eventLabel(regionReminder)).toBe('Escalation')
    })
  })

  describe('whoCell (who + why-tier)', () => {
    it('verification → the verifier, no sub-line', () => {
      expect(whoCell(verification)).toEqual({ name: 'Priya Deshmukh' })
    })

    it('manager reminder → recipient + Event manager tier', () => {
      expect(whoCell(managerReminder)).toEqual({ name: 'Priya Deshmukh', sub: 'Event manager' })
    })

    it('region reminder → recipient + Region manager tier + linking region', () => {
      expect(whoCell(regionReminder)).toEqual({
        name: 'Rohan Patil',
        sub: 'Region manager · Maharashtra',
      })
    })

    it('falls back to #id when an actor has no name', () => {
      expect(whoCell({ ...verification, by: { id: 42, name: '' } })).toEqual({ name: '#42' })
    })
  })

  describe('deliveryCell', () => {
    it('verification → the method label', () => {
      expect(deliveryCell(verification)).toEqual({ method: 'Email link' })
    })

    it('reminder → channel + destination (channel rendered as a muted label)', () => {
      expect(deliveryCell(regionReminder)).toEqual({
        channel: 'email',
        destination: 'rohan@example.com',
      })
    })
  })
})
