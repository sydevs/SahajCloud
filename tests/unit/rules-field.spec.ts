import { describe, expect, it } from 'vitest'

import type { RuleDefinition } from '@/fields/rulesField'

import { evaluateRules } from '@/fields/rulesField'

const DEFS: RuleDefinition[] = [
  { name: 'isMember', type: 'boolean' },
  { name: 'pathProgress', type: 'range' },
]

describe('evaluateRules', () => {
  it('returns true for null / undefined / empty rules', () => {
    expect(evaluateRules(null, {}, DEFS)).toBe(true)
    expect(evaluateRules(undefined, {}, DEFS)).toBe(true)
    expect(evaluateRules({}, {}, DEFS)).toBe(true)
    expect(evaluateRules({ logic: 'AND' }, {}, DEFS)).toBe(true)
    expect(evaluateRules({ logic: 'OR' }, { isMember: true }, DEFS)).toBe(true)
  })

  it('matches a boolean rule when caller value equals stored value', () => {
    expect(evaluateRules({ isMember: true }, { isMember: true }, DEFS)).toBe(true)
    expect(evaluateRules({ isMember: false }, { isMember: false }, DEFS)).toBe(true)
  })

  it('fails a boolean rule when caller value differs', () => {
    expect(evaluateRules({ isMember: true }, { isMember: false }, DEFS)).toBe(false)
    expect(evaluateRules({ isMember: false }, { isMember: true }, DEFS)).toBe(false)
  })

  it('fails a boolean rule when caller omits the param', () => {
    expect(evaluateRules({ isMember: true }, {}, DEFS)).toBe(false)
  })

  it('matches a range rule at inclusive bounds', () => {
    const rules = { pathProgress: { min: 1, max: 5 } }
    expect(evaluateRules(rules, { pathProgress: 1 }, DEFS)).toBe(true)
    expect(evaluateRules(rules, { pathProgress: 3 }, DEFS)).toBe(true)
    expect(evaluateRules(rules, { pathProgress: 5 }, DEFS)).toBe(true)
  })

  it('fails a range rule outside the bounds', () => {
    const rules = { pathProgress: { min: 1, max: 5 } }
    expect(evaluateRules(rules, { pathProgress: 0 }, DEFS)).toBe(false)
    expect(evaluateRules(rules, { pathProgress: 6 }, DEFS)).toBe(false)
  })

  it('treats open-ended min / max as ±Infinity', () => {
    expect(evaluateRules({ pathProgress: { max: 5 } }, { pathProgress: -100 }, DEFS)).toBe(true)
    expect(evaluateRules({ pathProgress: { max: 5 } }, { pathProgress: 5 }, DEFS)).toBe(true)
    expect(evaluateRules({ pathProgress: { max: 5 } }, { pathProgress: 6 }, DEFS)).toBe(false)
    expect(evaluateRules({ pathProgress: { min: 10 } }, { pathProgress: 9 }, DEFS)).toBe(false)
    expect(evaluateRules({ pathProgress: { min: 10 } }, { pathProgress: 10 }, DEFS)).toBe(true)
    expect(evaluateRules({ pathProgress: { min: 10 } }, { pathProgress: 9999 }, DEFS)).toBe(true)
  })

  it('fails a range rule when caller omits the param', () => {
    expect(evaluateRules({ pathProgress: { min: 0, max: 5 } }, {}, DEFS)).toBe(false)
  })

  it('applies AND logic by default (all rules must pass)', () => {
    const rules = {
      isMember: true,
      pathProgress: { min: 1, max: 5 },
    }
    expect(evaluateRules(rules, { isMember: true, pathProgress: 3 }, DEFS)).toBe(true)
    expect(evaluateRules(rules, { isMember: true, pathProgress: 6 }, DEFS)).toBe(false)
    expect(evaluateRules(rules, { isMember: false, pathProgress: 3 }, DEFS)).toBe(false)
  })

  it('applies OR logic (any rule may pass)', () => {
    const rules = {
      logic: 'OR' as const,
      isMember: true,
      pathProgress: { min: 10, max: 20 },
    }
    expect(evaluateRules(rules, { isMember: true, pathProgress: 1 }, DEFS)).toBe(true)
    expect(evaluateRules(rules, { isMember: false, pathProgress: 15 }, DEFS)).toBe(true)
    expect(evaluateRules(rules, { isMember: false, pathProgress: 1 }, DEFS)).toBe(false)
  })

  it('treats missing caller param as failure for OR logic too', () => {
    const rules = {
      logic: 'OR' as const,
      isMember: true,
      pathProgress: { min: 1, max: 5 },
    }
    // Neither param supplied → both rules fail → OR is false
    expect(evaluateRules(rules, {}, DEFS)).toBe(false)
  })

  it('ignores rule keys not present in the definitions', () => {
    // Stored rule has an unknown key; it should be skipped (not failed).
    expect(evaluateRules({ unknownKey: true }, {}, DEFS)).toBe(true)
  })
})
