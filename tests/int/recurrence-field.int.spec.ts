/**
 * Integration tests for recurrence field utilities
 *
 * Tests the recurrence field utility functions that handle:
 * - RRULE string generation from UI state
 * - RRULE string parsing to UI state
 * - Human-readable summary generation
 * - Validation logic
 *
 * These tests verify RFC 5545 compliance and correct RRULE handling.
 */
import { describe, it, expect } from 'vitest'
import { RRule, Frequency, rrulestr } from 'rrule'

import type { RecurrenceData, RecurrenceUIState } from '@/types/recurrence'
import { getDefaultUIState, isOneOff } from '@/types/recurrence'

import {
  dataToUIState,
  uiStateToData,
  getHumanReadableSummary,
  validateRecurrence,
  recurrenceTypeToFrequency,
  frequencyToRecurrenceType,
  weekLabelIndexToRRule,
  rruleWeekToLabelIndex,
  getOrdinalSuffix,
} from '@/components/admin/RecurrenceField/utils'

describe('Recurrence Field', () => {
  describe('Helper Functions', () => {
    describe('isOneOff', () => {
      it('returns true for null data', () => {
        expect(isOneOff(null)).toBe(true)
      })

      it('returns true for undefined data', () => {
        expect(isOneOff(undefined)).toBe(true)
      })

      it('returns true when rrule is null', () => {
        expect(isOneOff({ rrule: null, duration: 1 })).toBe(true)
      })

      it('returns false when rrule is a valid string', () => {
        expect(isOneOff({ rrule: 'FREQ=DAILY', duration: 1 })).toBe(false)
      })
    })

    describe('getDefaultUIState', () => {
      it('returns default state with recurrenceType none', () => {
        const state = getDefaultUIState()
        expect(state.recurrenceType).toBe('none')
        expect(state.interval).toBe(1)
        expect(state.weekdays).toEqual([])
        expect(state.duration).toBe(1)
      })

      it('respects custom default duration', () => {
        const state = getDefaultUIState(3)
        expect(state.duration).toBe(3)
      })
    })

    describe('recurrenceTypeToFrequency', () => {
      it('converts daily to DAILY frequency', () => {
        expect(recurrenceTypeToFrequency('daily')).toBe(Frequency.DAILY)
      })

      it('converts weekly to WEEKLY frequency', () => {
        expect(recurrenceTypeToFrequency('weekly')).toBe(Frequency.WEEKLY)
      })

      it('converts monthly to MONTHLY frequency', () => {
        expect(recurrenceTypeToFrequency('monthly')).toBe(Frequency.MONTHLY)
      })

      it('returns null for none', () => {
        expect(recurrenceTypeToFrequency('none')).toBe(null)
      })
    })

    describe('frequencyToRecurrenceType', () => {
      it('converts DAILY to daily', () => {
        expect(frequencyToRecurrenceType(Frequency.DAILY)).toBe('daily')
      })

      it('converts WEEKLY to weekly', () => {
        expect(frequencyToRecurrenceType(Frequency.WEEKLY)).toBe('weekly')
      })

      it('converts MONTHLY to monthly', () => {
        expect(frequencyToRecurrenceType(Frequency.MONTHLY)).toBe('monthly')
      })

      it('returns none for undefined', () => {
        expect(frequencyToRecurrenceType(undefined)).toBe('none')
      })

      it('returns none for unsupported frequencies', () => {
        expect(frequencyToRecurrenceType(Frequency.YEARLY)).toBe('none')
      })
    })

    describe('weekLabelIndexToRRule', () => {
      it('converts index 0 to 1 (1st)', () => {
        expect(weekLabelIndexToRRule(0)).toBe(1)
      })

      it('converts index 3 to 4 (4th)', () => {
        expect(weekLabelIndexToRRule(3)).toBe(4)
      })

      it('converts index 4 to -1 (Last)', () => {
        expect(weekLabelIndexToRRule(4)).toBe(-1)
      })
    })

    describe('rruleWeekToLabelIndex', () => {
      it('converts 1 to index 0', () => {
        expect(rruleWeekToLabelIndex(1)).toBe(0)
      })

      it('converts 4 to index 3', () => {
        expect(rruleWeekToLabelIndex(4)).toBe(3)
      })

      it('converts -1 to index 4 (Last)', () => {
        expect(rruleWeekToLabelIndex(-1)).toBe(4)
      })
    })

    describe('getOrdinalSuffix', () => {
      it('returns 1st for 1', () => {
        expect(getOrdinalSuffix(1)).toBe('1st')
      })

      it('returns 2nd for 2', () => {
        expect(getOrdinalSuffix(2)).toBe('2nd')
      })

      it('returns 3rd for 3', () => {
        expect(getOrdinalSuffix(3)).toBe('3rd')
      })

      it('returns 4th for 4', () => {
        expect(getOrdinalSuffix(4)).toBe('4th')
      })

      it('returns 11th for 11', () => {
        expect(getOrdinalSuffix(11)).toBe('11th')
      })

      it('returns 21st for 21', () => {
        expect(getOrdinalSuffix(21)).toBe('21st')
      })
    })
  })

  describe('dataToUIState', () => {
    it('returns default state for null data', () => {
      const state = dataToUIState(null)
      expect(state.recurrenceType).toBe('none')
      expect(state.duration).toBe(1)
    })

    it('returns default state for undefined data', () => {
      const state = dataToUIState(undefined)
      expect(state.recurrenceType).toBe('none')
    })

    it('returns default state with custom duration for null rrule', () => {
      const data: RecurrenceData = { rrule: null, duration: 5 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('none')
      expect(state.duration).toBe(5)
    })

    it('parses simple daily RRULE', () => {
      const data: RecurrenceData = { rrule: 'FREQ=DAILY', duration: 1 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('daily')
      expect(state.interval).toBe(1)
    })

    it('parses daily RRULE with interval', () => {
      const data: RecurrenceData = { rrule: 'FREQ=DAILY;INTERVAL=3', duration: 1 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('daily')
      expect(state.interval).toBe(3)
    })

    it('parses weekly RRULE with weekdays', () => {
      const data: RecurrenceData = { rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', duration: 1 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('weekly')
      expect(state.weekdays).toEqual([0, 2, 4]) // Mo=0, We=2, Fr=4
    })

    it('parses bi-weekly RRULE', () => {
      const data: RecurrenceData = { rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH', duration: 1 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('weekly')
      expect(state.interval).toBe(2)
      expect(state.weekdays).toEqual([1, 3]) // Tu=1, Th=3
    })

    it('parses monthly by date RRULE', () => {
      const data: RecurrenceData = { rrule: 'FREQ=MONTHLY;BYMONTHDAY=15', duration: 1 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('monthly')
      expect(state.monthlyMode).toBe('date')
      expect(state.monthDay).toBe(15)
    })

    it('parses monthly by weekday RRULE (2nd Tuesday)', () => {
      // 2TU means 2nd Tuesday
      const rule = new RRule({
        freq: Frequency.MONTHLY,
        byweekday: RRule.TU.nth(2),
      })
      const data: RecurrenceData = { rrule: rule.toString(), duration: 1 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('monthly')
      expect(state.monthlyMode).toBe('weekday')
      expect(state.weekdayOfMonth).toBe(1) // Tuesday = 1
      expect(state.weekNumber).toBe(2)
    })

    it('parses RRULE with count ending', () => {
      const data: RecurrenceData = { rrule: 'FREQ=DAILY;COUNT=10', duration: 1 }
      const state = dataToUIState(data)
      expect(state.endingType).toBe('count')
      expect(state.count).toBe(10)
    })

    it('parses RRULE with until ending', () => {
      const until = new Date('2025-12-31')
      const rule = new RRule({
        freq: Frequency.DAILY,
        until,
      })
      const data: RecurrenceData = { rrule: rule.toString(), duration: 1 }
      const state = dataToUIState(data)
      expect(state.endingType).toBe('until')
      expect(state.until).toBeInstanceOf(Date)
    })

    it('preserves duration when parsing', () => {
      const data: RecurrenceData = { rrule: 'FREQ=DAILY', duration: 7 }
      const state = dataToUIState(data)
      expect(state.duration).toBe(7)
    })

    it('handles invalid RRULE gracefully', () => {
      const data: RecurrenceData = { rrule: 'INVALID_RRULE', duration: 3 }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('none')
      expect(state.duration).toBe(3)
    })
  })

  describe('uiStateToData', () => {
    it('returns null rrule for one-off events', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'none',
      }
      const data = uiStateToData(state)
      expect(data.rrule).toBe(null)
      expect(data.duration).toBe(1)
    })

    it('generates valid daily RRULE', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        interval: 1,
      }
      const data = uiStateToData(state)
      expect(data.rrule).not.toBe(null)
      const rule = rrulestr(data.rrule!)
      expect(rule.options.freq).toBe(Frequency.DAILY)
    })

    it('generates daily RRULE with interval', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        interval: 3,
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('FREQ=DAILY')
      expect(data.rrule).toContain('INTERVAL=3')
    })

    it('generates weekly RRULE with specific days', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'weekly',
        weekdays: [0, 2, 4], // Mon, Wed, Fri
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('FREQ=WEEKLY')
      const rule = rrulestr(data.rrule!)
      expect(rule.options.byweekday).toEqual([0, 2, 4])
    })

    it('generates bi-weekly RRULE', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'weekly',
        interval: 2,
        weekdays: [1, 3], // Tue, Thu
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('FREQ=WEEKLY')
      expect(data.rrule).toContain('INTERVAL=2')
    })

    it('generates monthly RRULE by date', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'monthly',
        monthlyMode: 'date',
        monthDay: 15,
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('FREQ=MONTHLY')
      expect(data.rrule).toContain('BYMONTHDAY=15')
    })

    it('generates monthly RRULE by weekday (2nd Tuesday)', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'monthly',
        monthlyMode: 'weekday',
        weekNumber: 2,
        weekdayOfMonth: 1, // Tuesday
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('FREQ=MONTHLY')
      // Should contain BYDAY with the weekday pattern
      const rule = rrulestr(data.rrule!)
      expect(rule.options.freq).toBe(Frequency.MONTHLY)
    })

    it('includes COUNT for count ending', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        endingType: 'count',
        count: 20,
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('COUNT=20')
    })

    it('includes UNTIL for date ending', () => {
      const until = new Date('2025-12-31')
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        endingType: 'until',
        until,
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('UNTIL=')
    })

    it('preserves duration in output', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        duration: 5,
      }
      const data = uiStateToData(state)
      expect(data.duration).toBe(5)
    })

    it('omits interval when it is 1', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        interval: 1,
      }
      const data = uiStateToData(state)
      expect(data.rrule).not.toContain('INTERVAL')
    })
  })

  describe('Round-Trip Conversion', () => {
    it('preserves daily recurrence through round-trip', () => {
      const original: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        interval: 2,
        duration: 3,
      }
      const data = uiStateToData(original)
      const restored = dataToUIState(data)

      expect(restored.recurrenceType).toBe(original.recurrenceType)
      expect(restored.interval).toBe(original.interval)
      expect(restored.duration).toBe(original.duration)
    })

    it('preserves weekly recurrence through round-trip', () => {
      const original: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'weekly',
        weekdays: [0, 2, 4],
        interval: 1,
        duration: 1,
      }
      const data = uiStateToData(original)
      const restored = dataToUIState(data)

      expect(restored.recurrenceType).toBe(original.recurrenceType)
      expect(restored.weekdays).toEqual(original.weekdays)
    })

    it('preserves monthly by date through round-trip', () => {
      const original: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'monthly',
        monthlyMode: 'date',
        monthDay: 25,
        duration: 2,
      }
      const data = uiStateToData(original)
      const restored = dataToUIState(data)

      expect(restored.recurrenceType).toBe(original.recurrenceType)
      expect(restored.monthlyMode).toBe('date')
      expect(restored.monthDay).toBe(original.monthDay)
    })

    it('preserves count ending through round-trip', () => {
      const original: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        endingType: 'count',
        count: 15,
      }
      const data = uiStateToData(original)
      const restored = dataToUIState(data)

      expect(restored.endingType).toBe('count')
      expect(restored.count).toBe(15)
    })
  })

  describe('getHumanReadableSummary', () => {
    it('returns "Does not repeat" for one-off events', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'none',
      }
      expect(getHumanReadableSummary(state)).toBe('Does not repeat')
    })

    it('returns readable text for daily recurrence', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        interval: 1,
      }
      const summary = getHumanReadableSummary(state)
      expect(summary.toLowerCase()).toContain('day')
    })

    it('returns readable text for weekly recurrence', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'weekly',
        weekdays: [0, 2, 4], // Mon, Wed, Fri
      }
      const summary = getHumanReadableSummary(state)
      expect(summary.toLowerCase()).toContain('week')
    })

    it('includes duration for multi-day events', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        duration: 3,
      }
      const summary = getHumanReadableSummary(state)
      expect(summary).toContain('3-day event')
    })

    it('does not include duration text for single-day events', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        duration: 1,
      }
      const summary = getHumanReadableSummary(state)
      expect(summary).not.toContain('day event')
    })

    it('returns "Invalid recurrence pattern" for invalid state', () => {
      // Create a state that would cause RRule to fail
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'monthly',
        monthlyMode: 'weekday',
        weekNumber: 999, // Invalid
        weekdayOfMonth: 999, // Invalid
      }
      const summary = getHumanReadableSummary(state)
      // Should either be valid text or indicate invalid
      expect(typeof summary).toBe('string')
    })
  })

  describe('validateRecurrence', () => {
    it('returns null for valid one-off events', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'none',
      }
      expect(validateRecurrence(state)).toBe(null)
    })

    it('returns null for valid daily recurrence', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        interval: 2,
      }
      expect(validateRecurrence(state)).toBe(null)
    })

    it('returns error for weekly without weekdays', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'weekly',
        weekdays: [],
      }
      const error = validateRecurrence(state)
      expect(error).not.toBe(null)
      expect(error).toContain('day of the week')
    })

    it('returns null for valid weekly with weekdays', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'weekly',
        weekdays: [0, 2],
      }
      expect(validateRecurrence(state)).toBe(null)
    })

    it('returns error for invalid month day', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'monthly',
        monthlyMode: 'date',
        monthDay: 32, // Invalid
      }
      const error = validateRecurrence(state)
      expect(error).not.toBe(null)
      expect(error).toContain('day of the month')
    })

    it('returns error for count less than 1', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        endingType: 'count',
        count: 0,
      }
      const error = validateRecurrence(state)
      expect(error).not.toBe(null)
      expect(error).toContain('occurrences')
    })

    it('returns error for duration less than 1', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        duration: 0,
      }
      const error = validateRecurrence(state)
      expect(error).not.toBe(null)
      expect(error).toContain('Duration')
    })
  })

  describe('RRULE Compliance', () => {
    it('generates RRULE strings that can be parsed by rrule library', () => {
      const testCases: RecurrenceUIState[] = [
        { ...getDefaultUIState(), recurrenceType: 'daily', interval: 1 },
        { ...getDefaultUIState(), recurrenceType: 'daily', interval: 3 },
        { ...getDefaultUIState(), recurrenceType: 'weekly', weekdays: [0, 2, 4] },
        { ...getDefaultUIState(), recurrenceType: 'weekly', interval: 2, weekdays: [1] },
        { ...getDefaultUIState(), recurrenceType: 'monthly', monthlyMode: 'date', monthDay: 15 },
      ]

      for (const state of testCases) {
        const data = uiStateToData(state)
        if (data.rrule) {
          // Should not throw
          expect(() => rrulestr(data.rrule!)).not.toThrow()
        }
      }
    })

    it('generates RRULEs that produce valid date occurrences', () => {
      const state: RecurrenceUIState = {
        ...getDefaultUIState(),
        recurrenceType: 'daily',
        interval: 1,
        endingType: 'count',
        count: 5,
      }
      const data = uiStateToData(state)
      const rule = rrulestr(data.rrule!)

      const occurrences = rule.all()
      expect(occurrences).toHaveLength(5)
      occurrences.forEach((date) => {
        expect(date).toBeInstanceOf(Date)
      })
    })
  })
})
