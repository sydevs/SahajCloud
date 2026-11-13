/**
 * The app-card view timeline (`viewScheduleAfterRead`): which view an event card
 * shows at each UTC time of day. No Payload boot — the hook reads only `data`.
 */
import type { FixtureOverrides } from '../utils/testData'
import type { FieldHook } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { viewScheduleAfterRead } from '@/collections/AppCards/hooks/viewSchedule'
import type { AppCard } from '@/payload-types'

const req = { payload: { logger: { debug: vi.fn() } } }

const timeline = (data: FixtureOverrides<AppCard>) =>
  viewScheduleAfterRead({ data, req } as unknown as Parameters<FieldHook>[0])

describe('app-card view schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives a standard card the default view all day', () => {
    expect(timeline({ type: 'standard' })).toEqual({
      timezone: 'UTC',
      schedule: { '00:00': 'default' },
    })
  })

  it('keeps a window inside one UTC day bounded by default on both sides', () => {
    expect(
      timeline({
        type: 'event',
        schedule: { firstDate: '2026-06-10T14:00:00.000Z', firstDate_tz: 'UTC', endTime: '15:00' },
        startingSoon: { enabled: true, threshold: '1:00' },
        liveNow: { enabled: true, threshold: '0:00' },
      }),
    ).toEqual({
      timezone: 'UTC',
      schedule: {
        '00:00': 'default',
        '13:00': 'startingSoon',
        '14:00': 'liveNow',
        '15:00': 'default',
      },
    })
  })

  it('carries a live window across midnight UTC instead of cutting it at 00:00', () => {
    // 7:30–8:30 pm in New York (EDT) is 23:30–00:30 UTC.
    expect(
      timeline({
        type: 'event',
        schedule: {
          firstDate: '2026-06-10T23:30:00.000Z',
          firstDate_tz: 'America/New_York',
          endTime: '20:30',
        },
        liveNow: { enabled: true, threshold: '0:00' },
      }),
    ).toEqual({
      timezone: 'UTC',
      schedule: { '00:00': 'liveNow', '00:30': 'default', '23:30': 'liveNow' },
    })
  })

  it('carries a starting-soon window across midnight UTC', () => {
    expect(
      timeline({
        type: 'event',
        schedule: { firstDate: '2026-06-10T00:30:00.000Z', firstDate_tz: 'UTC', endTime: '01:30' },
        startingSoon: { enabled: true, threshold: '1:00' },
        liveNow: { enabled: true, threshold: '0:00' },
      }),
    ).toEqual({
      timezone: 'UTC',
      schedule: {
        '00:00': 'startingSoon',
        '00:30': 'liveNow',
        '01:30': 'default',
        '23:30': 'startingSoon',
      },
    })
  })

  it('lets a view that opens exactly at 00:00 own that key', () => {
    expect(
      timeline({
        type: 'event',
        schedule: { firstDate: '2026-06-10T00:00:00.000Z', firstDate_tz: 'UTC', endTime: '01:00' },
        liveNow: { enabled: true, threshold: '0:00' },
      }),
    ).toEqual({
      timezone: 'UTC',
      schedule: { '00:00': 'liveNow', '01:00': 'default' },
    })
  })
})
