import { describe, expect, it } from 'vitest'

import {
  buildImportVerification,
  importCheckOffsetDays,
  importDeletedAt,
  isCurrentLifecycleFlag,
  mapStatusToStage,
} from '../../seeds/atlas/helpers/verification'

describe('mapStatusToStage', () => {
  it('maps Atlas status 0 → verified and 6 → finished', () => {
    expect(mapStatusToStage(0)).toBe('verified')
    expect(mapStatusToStage(6)).toBe('finished')
  })

  it('defaults unknown/null status to verified', () => {
    expect(mapStatusToStage(null)).toBe('verified')
    expect(mapStatusToStage(undefined)).toBe('verified')
    expect(mapStatusToStage(99)).toBe('verified')
  })

  // `status` is the only authoritative current-state flag in the dump. 12 events
  // carry a `finished_at` while sitting at status 0 — every one of them has a
  // *later* `verified_at`, i.e. they were reactivated and Atlas never cleared the
  // stamp. Deriving `finished` from the timestamp would wrongly retire 12 live
  // events, so this pins the status-only behaviour.
  it('ignores a stale finished_at: status 0 stays verified', () => {
    expect(mapStatusToStage(0)).toBe('verified')
    expect(
      importDeletedAt({ archived_at: null, verified_at: '2024-07-11T00:00:00.000Z' }),
    ).toBeUndefined()
  })
})

describe('isCurrentLifecycleFlag', () => {
  const FLAG = '2023-05-09T00:00:00.000Z'

  it('is false when the flag was never set', () => {
    expect(isCurrentLifecycleFlag(null, null)).toBe(false)
    expect(isCurrentLifecycleFlag(undefined, FLAG)).toBe(false)
    expect(isCurrentLifecycleFlag('', FLAG)).toBe(false)
  })

  it('is true when nothing re-verified the event afterwards', () => {
    expect(isCurrentLifecycleFlag(FLAG, null)).toBe(true)
    expect(isCurrentLifecycleFlag(FLAG, undefined)).toBe(true)
    expect(isCurrentLifecycleFlag(FLAG, '2023-01-17T00:00:00.000Z')).toBe(true)
  })

  it('is false when a later verification supersedes it', () => {
    expect(isCurrentLifecycleFlag(FLAG, '2024-07-11T00:00:00.000Z')).toBe(false)
  })

  it('treats an identical timestamp as still current (strict supersede)', () => {
    expect(isCurrentLifecycleFlag(FLAG, FLAG)).toBe(true)
  })
})

describe('importDeletedAt', () => {
  it('trashes an event whose archived_at is still current', () => {
    // The legacyId 75 shape: archived 2022-09, last verified 2022-06.
    expect(
      importDeletedAt({
        archived_at: '2022-09-14T11:04:40.125Z',
        verified_at: '2022-06-22T00:00:00.000Z',
      }),
    ).toBe('2022-09-14T11:04:40.125Z')
  })

  it('leaves a reactivated event alone', () => {
    // The other 287: archived, then re-verified afterwards.
    expect(
      importDeletedAt({
        archived_at: '2024-07-07T12:21:03.220Z',
        verified_at: '2024-07-11T00:00:00.000Z',
      }),
    ).toBeUndefined()
  })

  it('returns undefined when never archived, or with no legacyData', () => {
    expect(importDeletedAt({ verified_at: '2024-07-11T00:00:00.000Z' })).toBeUndefined()
    expect(importDeletedAt({})).toBeUndefined()
    expect(importDeletedAt(null)).toBeUndefined()
    expect(importDeletedAt(undefined)).toBeUndefined()
  })
})

describe('importCheckOffsetDays', () => {
  it('never schedules the first check sooner than the full cadence', () => {
    // Forward-only stagger: the jitter is added on top of the cadence, so no
    // imported event is ever due earlier than it would have been.
    for (const legacyId of [0, 1, 29, 30, 89, 90, 511, 9999]) {
      expect(importCheckOffsetDays('Monthly', legacyId)).toBeGreaterThanOrEqual(30)
      expect(importCheckOffsetDays(null, legacyId)).toBeGreaterThanOrEqual(90)
    }
  })

  it('keeps the spread within one extra cadence', () => {
    for (const legacyId of [0, 1, 29, 30, 89, 90, 511, 9999]) {
      expect(importCheckOffsetDays('Monthly', legacyId)).toBeLessThan(60)
      expect(importCheckOffsetDays(null, legacyId)).toBeLessThan(180)
    }
  })

  it('is deterministic — a re-seed reproduces the same date', () => {
    // Math.random() would reshuffle all 417 due dates on every --update run.
    expect(importCheckOffsetDays('Monthly', 137)).toBe(importCheckOffsetDays('Monthly', 137))
    expect(importCheckOffsetDays(null, 137)).toBe(importCheckOffsetDays(null, 137))
  })

  it('spreads consecutive legacyIds across distinct days', () => {
    const offsets = [10, 11, 12, 13, 14].map((id) => importCheckOffsetDays(null, id))
    expect(new Set(offsets).size).toBe(5)
  })

  it('derives the offset from the cadence + legacyId modulo', () => {
    expect(importCheckOffsetDays('Monthly', 7)).toBe(37) // 30 + (7 % 30)
    expect(importCheckOffsetDays(null, 100)).toBe(100) // 90 + (100 % 90)
    expect(importCheckOffsetDays('6 Months', 5)).toBe(185) // 180 + (5 % 180)
  })

  it('tolerates a non-positive or fractional legacyId', () => {
    expect(importCheckOffsetDays('Monthly', -7)).toBe(37)
    expect(importCheckOffsetDays('Monthly', 7.9)).toBe(37)
  })
})

describe('buildImportVerification', () => {
  const now = new Date('2026-06-15T00:00:00.000Z')

  it('seeds a verified event with a staggered nextCheckAt + an import log entry', () => {
    // legacyId 30 on the Monthly cadence → jitter 0, so exactly one cadence out.
    const fields = buildImportVerification({ status: 0, cadence: 'Monthly', legacyId: 30, now })
    expect(fields.verificationStage).toBe('verified')
    expect(fields.nextCheckAt).toBe('2026-07-15T00:00:00.000Z')
    // The machine fields this seeding is about — not the whole entry, which
    // also carries display cells composed by `buildVerificationEntry`.
    expect(fields.activityLog).toHaveLength(1)
    expect(fields.activityLog?.[0]).toMatchObject({
      kind: 'verification',
      at: now.toISOString(),
      by: null,
      method: 'import',
    })
  })

  it('falls back to the default period for an unknown cadence', () => {
    const fields = buildImportVerification({ status: 0, cadence: null, legacyId: 90, now })
    // Default 90 days, jitter 0.
    expect(fields.nextCheckAt).toBe('2026-09-13T00:00:00.000Z')
  })

  it('staggers two events on the same cadence onto different days', () => {
    const a = buildImportVerification({ status: 0, cadence: 'Monthly', legacyId: 1, now })
    const b = buildImportVerification({ status: 0, cadence: 'Monthly', legacyId: 2, now })
    expect(a.nextCheckAt).not.toBe(b.nextCheckAt)
  })

  it('seeds a finished event with its retention deadline, so it can be trashed later', () => {
    // The job's only query is `nextCheckAt <= now`, so an imported finished
    // event with no watermark would never reach the retention transition.
    const fields = buildImportVerification({
      status: 6,
      cadence: 'Monthly',
      legacyId: 1,
      now,
      schedule: {
        firstDate: '2026-02-01T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
      },
    })
    expect(fields.verificationStage).toBe('finished')
    // 6 months after the end of the single occurrence's local day.
    expect(fields.nextCheckAt?.slice(0, 7)).toBe('2026-08')
    expect(fields.activityLog[0]).toMatchObject({ kind: 'verification', method: 'import' })
  })

  it('still arms a finished event with no schedule end, measured from the import', () => {
    // The dump maps status straight to the stage, so a dormant or open-ended
    // event can land on `finished` with nothing to measure retention from.
    // Falling back to the import moment keeps it reachable — otherwise the row
    // would carry a null watermark and never be trashed.
    const fields = buildImportVerification({ status: 6, cadence: 'Monthly', legacyId: 1, now })
    expect(fields.verificationStage).toBe('finished')
    expect(fields.nextCheckAt?.slice(0, 7)).toBe('2026-12') // now (2026-06-15) + 6 months
  })

  it('records the acting manager when given', () => {
    const fields = buildImportVerification({
      status: 0,
      cadence: 'Monthly',
      legacyId: 1,
      now,
      actor: { id: 7, name: 'Priya' },
    })
    expect(fields.activityLog[0].by).toEqual({ id: 7, name: 'Priya' })
  })
})
