import { describe, expect, it } from 'vitest'

import { isGeneratedTestSchema } from '../setup/globalSetup'

/**
 * Guards the destructive orphaned-schema sweep (#499 §7): the predicate decides
 * which schemas get `DROP SCHEMA … CASCADE`d, so it must match the per-suite
 * generator's output and nothing else — especially not real schemas.
 */
describe('isGeneratedTestSchema', () => {
  it('matches names minted by makeTestSchemaName() (test_<base36>_<base36>)', () => {
    // Shape produced by `test_${Date.now().toString(36)}_${rand.toString(36)}`
    expect(isGeneratedTestSchema('test_lk3j2p_z9y8x7')).toBe(true)
    expect(isGeneratedTestSchema('test_0_0')).toBe(true)
    expect(isGeneratedTestSchema('test_abc123_def456')).toBe(true)
  })

  it('does NOT match real or system schemas', () => {
    for (const real of [
      'public',
      'seed_test',
      'e2e',
      'information_schema',
      'pg_catalog',
      'pg_toast',
    ]) {
      expect(isGeneratedTestSchema(real)).toBe(false)
    }
  })

  it('does NOT match near-misses (no double-suffix, wrong prefix, casing)', () => {
    expect(isGeneratedTestSchema('test')).toBe(false)
    expect(isGeneratedTestSchema('test_')).toBe(false)
    expect(isGeneratedTestSchema('test_onlyonepart')).toBe(false)
    expect(isGeneratedTestSchema('testing_a_b')).toBe(false)
    expect(isGeneratedTestSchema('TEST_AB_CD')).toBe(false) // base36 output is lowercase
    expect(isGeneratedTestSchema('my_test_a_b')).toBe(false)
  })
})
