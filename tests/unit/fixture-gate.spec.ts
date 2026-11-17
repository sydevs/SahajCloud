import { describe, expect, it } from 'vitest'

import { at } from '@/fixture/at'
import { fixtureGate, type FixtureGateInput } from '@/fixture/gate'
import { entryHash } from '@/fixture/load'
import type { FixtureEntry } from '@/fixture/types'

/** A Railway preview's Next server: the one place the fixture always loads. */
const PREVIEW: FixtureGateInput = {
  isProduction: false,
  nextRuntime: 'nodejs',
  nextPhase: undefined,
  nodeEnv: 'production',
  e2e: false,
}

describe('fixtureGate', () => {
  it('loads in a preview’s or a laptop’s Next server', () => {
    expect(fixtureGate(PREVIEW)).toBe(true)
    expect(fixtureGate({ ...PREVIEW, nodeEnv: 'development' })).toBe(true)
  })

  it.each<[string, Partial<FixtureGateInput>]>([
    ['production', { isProduction: true }],
    ['a script, a seed or a test, outside the Next server', { nextRuntime: undefined }],
    ['the build', { nextPhase: 'phase-production-build' }],
    ['the test lanes', { nodeEnv: 'test' }],
    ['an E2E run', { e2e: true }],
  ])('never loads in %s', (_name, patch) => {
    expect(fixtureGate({ ...PREVIEW, ...patch })).toBe(false)
  })
})

describe('entryHash', () => {
  const now = new Date('2026-11-16T10:00:00Z')
  const entry: FixtureEntry<'narrators'> = {
    id: 1_906_001,
    data: { name: 'Fixture Asha', gender: 'female' },
  }

  it('moves with the content and never with the id', () => {
    expect(entryHash(entry, null, now)).toBe(entryHash({ ...entry, id: 1_906_002 }, null, now))
    expect(entryHash(entry, null, now)).not.toBe(
      entryHash<'narrators'>({ ...entry, data: { ...entry.data, name: 'Fixture Bea' } }, null, now),
    )
  })

  it('moves an upload’s hash weekly, so the 7-day preview sweep never strands its file', () => {
    const file = Buffer.from('bytes')
    const nextWeek = new Date('2026-11-23T10:00:00Z')
    expect(entryHash(entry, file, now)).toBe(entryHash(entry, file, new Date('2026-11-17T09:00Z')))
    expect(entryHash(entry, file, now)).not.toBe(entryHash(entry, file, nextWeek))
    expect(entryHash(entry, null, now)).toBe(entryHash(entry, null, nextWeek))
  })
})

describe('at', () => {
  it('resolves to the day and time asked, in UTC, whatever the hour now', () => {
    expect(at({ days: -3, hour: 18 }, new Date('2026-11-16T23:59:00Z'))).toBe(
      '2026-11-13T18:00:00.000Z',
    )
    expect(at({ days: -3, hour: 18 }, new Date('2026-11-16T00:01:00Z'))).toBe(
      '2026-11-13T18:00:00.000Z',
    )
  })
})
