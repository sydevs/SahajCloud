import { describe, expect, it } from 'vitest'

import { buildImportVerification, mapStatusToStage } from '../../seeds/atlas/helpers/verification'

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
})

describe('buildImportVerification', () => {
  const now = new Date('2026-06-15T00:00:00.000Z')

  it('seeds a verified event with nextCheckAt from the cadence + an import log entry', () => {
    const fields = buildImportVerification({ status: 0, cadence: 'Monthly', now })
    expect(fields.verificationStage).toBe('verified')
    // Monthly cadence = 30 days.
    expect(fields.nextCheckAt).toBe('2026-07-15T00:00:00.000Z')
    expect(fields.notificationLog).toEqual([
      { kind: 'verification', at: now.toISOString(), by: null, method: 'import' },
    ])
  })

  it('falls back to the default period for an unknown cadence', () => {
    const fields = buildImportVerification({ status: 0, cadence: null, now })
    // Default 90 days.
    expect(fields.nextCheckAt).toBe('2026-09-13T00:00:00.000Z')
  })

  it('seeds a finished (terminal) event with no active nextCheckAt', () => {
    const fields = buildImportVerification({ status: 6, cadence: 'Monthly', now })
    expect(fields.verificationStage).toBe('finished')
    expect(fields.nextCheckAt).toBeUndefined()
    expect(fields.notificationLog[0]).toMatchObject({ kind: 'verification', method: 'import' })
  })

  it('records the acting manager when given', () => {
    const fields = buildImportVerification({
      status: 0,
      cadence: 'Monthly',
      now,
      actor: { id: 7, name: 'Priya' },
    })
    expect(fields.notificationLog[0].by).toEqual({ id: 7, name: 'Priya' })
  })
})
