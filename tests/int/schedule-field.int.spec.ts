/**
 * Integration tests for schedule field utilities
 *
 * Tests the schedule field utility functions that handle:
 * - UTC string normalization and validation
 * - Local to UTC and UTC to local conversions
 * - UI state to stored data conversions
 * - Human-readable summary generation
 * - Validation logic
 *
 * These tests verify RFC 5545 compliance and correct datetime/timezone handling.
 */
import { describe, it, expect } from 'vitest'
import { RRule, Frequency, rrulestr } from 'rrule'

import type { ScheduleData, ScheduleUIState } from '@/types/schedule'
import {
  getDefaultUIState,
  isOneOff,
  normalizeUTCString,
  isValidUTCString,
  getBrowserTimezone,
  getAvailableTimezones,
} from '@/types/schedule'

import {
  dataToUIState,
  uiStateToData,
  getScheduleSummary,
  validateSchedule,
  localToUTC,
  utcToLocal,
  formatTime12h,
  formatDateLong,
  getTimezoneAbbr,
  recurrenceTypeToFrequency,
  frequencyToRecurrenceType,
  weekLabelIndexToRRule,
  rruleWeekToLabelIndex,
  getOrdinalSuffix,
} from '@/components/admin/ScheduleField/utils'

describe('Schedule Field', () => {
  describe('UTC Normalization', () => {
    describe('normalizeUTCString', () => {
      it('strips milliseconds from ISO string', () => {
        const result = normalizeUTCString('2024-03-15T14:00:00.000Z')
        expect(result).toBe('2024-03-15T14:00:00Z')
      })

      it('converts +00:00 suffix to Z', () => {
        const result = normalizeUTCString('2024-03-15T14:00:00+00:00')
        expect(result).toBe('2024-03-15T14:00:00Z')
      })

      it('handles already normalized strings', () => {
        const result = normalizeUTCString('2024-03-15T14:00:00Z')
        expect(result).toBe('2024-03-15T14:00:00Z')
      })

      it('throws for invalid datetime strings', () => {
        expect(() => normalizeUTCString('invalid')).toThrow()
      })
    })

    describe('isValidUTCString', () => {
      it('returns true for valid UTC string', () => {
        expect(isValidUTCString('2024-03-15T14:00:00Z')).toBe(true)
      })

      it('returns false for string with milliseconds', () => {
        expect(isValidUTCString('2024-03-15T14:00:00.000Z')).toBe(false)
      })

      it('returns false for string with offset', () => {
        expect(isValidUTCString('2024-03-15T14:00:00+00:00')).toBe(false)
      })

      it('returns false for date-only string', () => {
        expect(isValidUTCString('2024-03-15')).toBe(false)
      })
    })
  })

  describe('Timezone Utilities', () => {
    describe('getBrowserTimezone', () => {
      it('returns a string', () => {
        const tz = getBrowserTimezone()
        expect(typeof tz).toBe('string')
        expect(tz.length).toBeGreaterThan(0)
      })
    })

    describe('getAvailableTimezones', () => {
      it('returns an array of timezone strings', () => {
        const timezones = getAvailableTimezones()
        expect(Array.isArray(timezones)).toBe(true)
        expect(timezones.length).toBeGreaterThan(0)
        expect(timezones).toContain('America/New_York')
        expect(timezones).toContain('Europe/London')
      })
    })

    describe('getTimezoneAbbr', () => {
      it('returns short timezone abbreviation', () => {
        const abbr = getTimezoneAbbr('America/New_York')
        // Should be EST or EDT depending on date
        expect(['EST', 'EDT']).toContain(abbr)
      })

      it('returns timezone string for UTC', () => {
        const abbr = getTimezoneAbbr('UTC')
        expect(abbr).toBe('UTC')
      })
    })
  })

  describe('Local/UTC Conversions', () => {
    describe('localToUTC', () => {
      it('converts local time to UTC', () => {
        // Use a timezone with known offset
        const utc = localToUTC('2024-03-15', '09:00', 'UTC')
        expect(utc).toBe('2024-03-15T09:00:00Z')
      })

      it('handles timezone offset correctly', () => {
        // During standard time, NYC is UTC-5
        const utc = localToUTC('2024-01-15', '09:00', 'America/New_York')
        expect(utc).toBe('2024-01-15T14:00:00Z')
      })
    })

    describe('utcToLocal', () => {
      it('converts UTC to local time', () => {
        const { date, time } = utcToLocal('2024-03-15T14:00:00Z', 'UTC')
        expect(date).toBe('2024-03-15')
        expect(time).toBe('14:00')
      })

      it('handles timezone offset correctly', () => {
        // During standard time, NYC is UTC-5
        const { date, time } = utcToLocal('2024-01-15T14:00:00Z', 'America/New_York')
        expect(date).toBe('2024-01-15')
        expect(time).toBe('09:00')
      })
    })

    describe('Round-trip conversions', () => {
      it('preserves datetime through round-trip', () => {
        const originalDate = '2024-06-15'
        const originalTime = '14:30'
        const timezone = 'America/Los_Angeles'

        const utc = localToUTC(originalDate, originalTime, timezone)
        const { date, time } = utcToLocal(utc, timezone)

        expect(date).toBe(originalDate)
        expect(time).toBe(originalTime)
      })
    })
  })

  describe('Formatting Utilities', () => {
    describe('formatTime12h', () => {
      it('formats morning time correctly', () => {
        expect(formatTime12h('09:30')).toBe('9:30 AM')
      })

      it('formats afternoon time correctly', () => {
        expect(formatTime12h('14:30')).toBe('2:30 PM')
      })

      it('formats noon correctly', () => {
        expect(formatTime12h('12:00')).toBe('12:00 PM')
      })

      it('formats midnight correctly', () => {
        expect(formatTime12h('00:00')).toBe('12:00 AM')
      })
    })

    describe('formatDateLong', () => {
      it('formats date in long format', () => {
        const formatted = formatDateLong('2024-03-15', 'UTC')
        expect(formatted).toContain('March')
        expect(formatted).toContain('15')
        expect(formatted).toContain('2024')
        expect(formatted).toContain('Friday')
      })
    })
  })

  describe('Helper Functions', () => {
    describe('isOneOff', () => {
      it('returns true for null data', () => {
        expect(isOneOff(null)).toBe(true)
      })

      it('returns true for undefined data', () => {
        expect(isOneOff(undefined)).toBe(true)
      })

      it('returns true when rrule is null', () => {
        const data: ScheduleData = {
          dtstart: '2024-03-15T14:00:00Z',
          dtend: null,
          tzid: 'UTC',
          rrule: null,
          duration: 0,
        }
        expect(isOneOff(data)).toBe(true)
      })

      it('returns false when rrule is a valid string', () => {
        const data: ScheduleData = {
          dtstart: '2024-03-15T14:00:00Z',
          dtend: null,
          tzid: 'UTC',
          rrule: 'FREQ=DAILY',
          duration: 0,
        }
        expect(isOneOff(data)).toBe(false)
      })
    })

    describe('getDefaultUIState', () => {
      it('returns default state with recurrenceType none', () => {
        const state = getDefaultUIState()
        expect(state.recurrenceType).toBe('none')
        expect(state.interval).toBe(1)
        expect(state.weekdays).toEqual([])
      })

      it('uses provided timezone', () => {
        const state = getDefaultUIState('America/New_York')
        expect(state.timezone).toBe('America/New_York')
      })

      it('has empty end time by default', () => {
        const state = getDefaultUIState()
        expect(state.endTime).toBe('')
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
    })

    describe('weekLabelIndexToRRule', () => {
      it('converts index 0 to 1 (1st)', () => {
        expect(weekLabelIndexToRRule(0)).toBe(1)
      })

      it('converts index 4 to -1 (Last)', () => {
        expect(weekLabelIndexToRRule(4)).toBe(-1)
      })
    })

    describe('rruleWeekToLabelIndex', () => {
      it('converts 1 to index 0', () => {
        expect(rruleWeekToLabelIndex(1)).toBe(0)
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
    })

    it('returns default state for undefined data', () => {
      const state = dataToUIState(undefined)
      expect(state.recurrenceType).toBe('none')
    })

    it('extracts start date and time from dtstart', () => {
      const data: ScheduleData = {
        dtstart: '2024-03-15T14:00:00Z',
        dtend: null,
        tzid: 'UTC',
        rrule: null,
        duration: 0,
      }
      const state = dataToUIState(data)
      expect(state.startDate).toBe('2024-03-15')
      expect(state.startTime).toBe('14:00')
      expect(state.timezone).toBe('UTC')
    })

    it('extracts end time from dtend', () => {
      const data: ScheduleData = {
        dtstart: '2024-03-15T14:00:00Z',
        dtend: '2024-03-15T16:30:00Z',
        tzid: 'UTC',
        rrule: null,
        duration: 150,
      }
      const state = dataToUIState(data)
      expect(state.endTime).toBe('16:30')
    })

    it('parses simple daily RRULE', () => {
      const data: ScheduleData = {
        dtstart: '2024-03-15T14:00:00Z',
        dtend: null,
        tzid: 'UTC',
        rrule: 'FREQ=DAILY',
        duration: 0,
      }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('daily')
      expect(state.interval).toBe(1)
    })

    it('parses weekly RRULE with weekdays', () => {
      const data: ScheduleData = {
        dtstart: '2024-03-15T14:00:00Z',
        dtend: null,
        tzid: 'UTC',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
        duration: 0,
      }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('weekly')
      expect(state.weekdays).toEqual([0, 2, 4])
    })

    it('handles invalid RRULE gracefully', () => {
      const data: ScheduleData = {
        dtstart: '2024-03-15T14:00:00Z',
        dtend: null,
        tzid: 'UTC',
        rrule: 'INVALID_RRULE',
        duration: 0,
      }
      const state = dataToUIState(data)
      expect(state.recurrenceType).toBe('none')
    })
  })

  describe('uiStateToData', () => {
    it('returns null rrule for one-off events', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '14:00',
      }
      const data = uiStateToData(state)
      expect(data.rrule).toBe(null)
    })

    it('generates valid dtstart UTC string', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '14:00',
      }
      const data = uiStateToData(state)
      expect(data.dtstart).toBe('2024-03-15T14:00:00Z')
    })

    it('generates valid dtend UTC string when end time provided', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '14:00',
        endTime: '16:30',
      }
      const data = uiStateToData(state)
      expect(data.dtend).toBe('2024-03-15T16:30:00Z')
    })

    it('calculates duration in minutes', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '14:00',
        endTime: '16:30',
      }
      const data = uiStateToData(state)
      expect(data.duration).toBe(150) // 2.5 hours = 150 minutes
    })

    it('returns duration 0 for open-ended events', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '14:00',
        endTime: '',
      }
      const data = uiStateToData(state)
      expect(data.dtend).toBe(null)
      expect(data.duration).toBe(0)
    })

    it('generates daily RRULE with dtstart', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '14:00',
        recurrenceType: 'daily',
      }
      const data = uiStateToData(state)
      expect(data.rrule).not.toBe(null)
      expect(data.rrule).toContain('FREQ=DAILY')
    })

    it('generates weekly RRULE with weekdays', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '14:00',
        recurrenceType: 'weekly',
        weekdays: [0, 2, 4],
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('FREQ=WEEKLY')
    })

    it('preserves timezone', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '14:00',
      }
      const data = uiStateToData(state)
      expect(data.tzid).toBe('America/New_York')
    })
  })

  describe('Round-Trip Conversion', () => {
    it('preserves datetime through round-trip', () => {
      const original: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-06-15',
        startTime: '14:30',
        endTime: '16:00',
        recurrenceType: 'none',
      }
      const data = uiStateToData(original)
      const restored = dataToUIState(data, 'America/New_York')

      expect(restored.startDate).toBe(original.startDate)
      expect(restored.startTime).toBe(original.startTime)
      expect(restored.endTime).toBe(original.endTime)
      expect(restored.timezone).toBe(original.timezone)
    })

    it('preserves recurrence through round-trip', () => {
      const original: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '09:00',
        recurrenceType: 'weekly',
        weekdays: [0, 2, 4],
        interval: 2,
      }
      const data = uiStateToData(original)
      const restored = dataToUIState(data)

      expect(restored.recurrenceType).toBe('weekly')
      expect(restored.weekdays).toEqual([0, 2, 4])
      expect(restored.interval).toBe(2)
    })
  })

  describe('getScheduleSummary', () => {
    it('formats one-off event without end time', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        endTime: '',
        recurrenceType: 'none',
      }
      const summary = getScheduleSummary(state)
      expect(summary).toContain('Friday')
      expect(summary).toContain('March 15')
      expect(summary).toContain('9:00 AM')
      expect(summary).toContain('at') // "at" for no end time
    })

    it('formats one-off event with end time', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        endTime: '11:30',
        recurrenceType: 'none',
      }
      const summary = getScheduleSummary(state)
      expect(summary).toContain('9:00 AM')
      expect(summary).toContain('11:30 AM')
      expect(summary).toContain('-') // Time range separator
    })

    it('formats recurring event', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        endTime: '',
        recurrenceType: 'weekly',
        weekdays: [0, 2, 4],
      }
      const summary = getScheduleSummary(state)
      expect(summary.toLowerCase()).toContain('week')
    })

    it('includes timezone abbreviation', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        endTime: '',
        recurrenceType: 'none',
      }
      const summary = getScheduleSummary(state)
      // Should contain EST or EDT
      expect(summary).toMatch(/E[SD]T/)
    })
  })

  describe('validateSchedule', () => {
    it('returns null for valid one-off event', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
      }
      expect(validateSchedule(state)).toBe(null)
    })

    it('returns error for missing start date', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '',
        startTime: '09:00',
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
      expect(error).toContain('date')
    })

    it('returns error for missing start time', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '',
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
      expect(error).toContain('time')
    })

    it('returns error for missing timezone', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState(''),
        startDate: '2024-03-15',
        startTime: '09:00',
        timezone: '',
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
      expect(error?.toLowerCase()).toContain('timezone')
    })

    it('returns error when end time is before start time', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '14:00',
        endTime: '09:00', // Before start time
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
      expect(error?.toLowerCase()).toContain('end time')
    })

    it('returns error when end time equals start time', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '14:00',
        endTime: '14:00', // Same as start time
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
    })

    it('returns null when end time is after start time', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        endTime: '11:30',
      }
      expect(validateSchedule(state)).toBe(null)
    })

    it('returns error for weekly without weekdays', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        recurrenceType: 'weekly',
        weekdays: [],
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
      expect(error).toContain('day')
    })

    it('returns error for invalid month day', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        recurrenceType: 'monthly',
        monthlyMode: 'date',
        monthDay: 32,
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
      expect(error).toContain('day of the month')
    })

    it('returns error for count less than 1', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('America/New_York'),
        startDate: '2024-03-15',
        startTime: '09:00',
        recurrenceType: 'daily',
        endingType: 'count',
        count: 0,
      }
      const error = validateSchedule(state)
      expect(error).not.toBe(null)
      expect(error).toContain('occurrences')
    })
  })

  describe('RRULE Compliance', () => {
    it('generates RRULE strings that can be parsed by rrule library', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '09:00',
        recurrenceType: 'daily',
        interval: 1,
      }
      const data = uiStateToData(state)
      expect(() => rrulestr(data.rrule!)).not.toThrow()
    })

    it('generates RRULEs with embedded DTSTART', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '09:00',
        recurrenceType: 'daily',
        endingType: 'count',
        count: 5,
      }
      const data = uiStateToData(state)
      expect(data.rrule).toContain('DTSTART')
    })

    it('generates RRULEs that produce valid date occurrences', () => {
      const state: ScheduleUIState = {
        ...getDefaultUIState('UTC'),
        startDate: '2024-03-15',
        startTime: '09:00',
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
