import type { RuleDefinition, RulesValue } from '@/fields/rulesField'

/**
 * Caller-supplied values corresponding to the AppCards rule definitions.
 * Each key is optional — when absent, any rule that references that key fails
 * (per the "missing caller param = rule does not match" contract).
 */
export type UserRuleInputs = {
  hasRealization?: boolean
  pathProgress?: number
  meditationsPerWeek?: number
  totalMeditationsViewed?: number
  totalLecturesViewed?: number
}

/**
 * AppCards rule definitions. Kept as a constant so evaluation and the Zod
 * query schema stay in sync with the field registration on the collection.
 */
export const APP_CARD_RULE_DEFINITIONS: RuleDefinition[] = [
  { name: 'hasRealization', type: 'boolean' },
  { name: 'pathProgress', type: 'range' },
  { name: 'meditationsPerWeek', type: 'range' },
  { name: 'totalMeditationsViewed', type: 'range' },
  { name: 'totalLecturesViewed', type: 'range' },
]

function evaluateBoolean(stored: boolean, supplied: unknown): boolean {
  return typeof supplied === 'boolean' && supplied === stored
}

function evaluateRange(
  stored: { min?: number; max?: number },
  supplied: unknown,
): boolean {
  if (typeof supplied !== 'number' || !Number.isFinite(supplied)) return false
  const min = stored.min ?? Number.NEGATIVE_INFINITY
  const max = stored.max ?? Number.POSITIVE_INFINITY
  return supplied >= min && supplied <= max
}

/**
 * Evaluate whether a card's stored targeting rules match the caller's inputs.
 *
 * Contract:
 *   - Empty / missing rules → always match
 *   - `logic` defaults to `'AND'`; `'OR'` needs only one configured rule to match
 *   - Missing caller param → the rule for that key fails (does not match)
 *   - Boolean rule matches when `supplied === stored`
 *   - Range `{min?, max?}` matches when `min <= supplied <= max` (undefined bounds
 *     treated as ±Infinity)
 *   - Unknown / unsupported rule types are ignored (neither pass nor fail)
 */
export function evaluateRules(
  rules: RulesValue | null | undefined,
  inputs: UserRuleInputs,
  definitions: RuleDefinition[] = APP_CARD_RULE_DEFINITIONS,
): boolean {
  if (!rules) return true

  const logic = rules.logic === 'OR' ? 'OR' : 'AND'
  const results: boolean[] = []

  for (const def of definitions) {
    const stored = rules[def.name]
    if (stored === undefined) continue

    const supplied = inputs[def.name as keyof UserRuleInputs]

    if (def.type === 'boolean' && typeof stored === 'boolean') {
      results.push(evaluateBoolean(stored, supplied))
    } else if (def.type === 'range' && typeof stored === 'object' && stored !== null) {
      results.push(evaluateRange(stored as { min?: number; max?: number }, supplied))
    }
  }

  if (results.length === 0) return true
  return logic === 'AND' ? results.every(Boolean) : results.some(Boolean)
}
