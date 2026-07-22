/**
 * Soft per-key character budget for a translation's UI slot.
 *
 * A budget is advisory: an over-budget string still saves. The admin surfaces
 * it as a per-row hint ("max 14") and, once exceeded, a non-blocking warning
 * showing the live count against the budget ("18 / 14"). `budgetStatus` returns
 * `null` when the key has no (positive) budget so callers render nothing.
 *
 * Length is counted in Unicode code points (`[...value]`), not UTF-16 units, so
 * a surrogate-pair glyph (emoji, rare CJK) counts once rather than twice — the
 * budget then tracks "characters a reader sees" more faithfully for the
 * international copy this exists to serve.
 */
export interface BudgetStatus {
  /** The key's character budget. */
  budget: number
  /** Current translated-value length, in code points. */
  length: number
  /** True once the value exceeds the budget. */
  over: boolean
}

export function budgetStatus(value: string, charBudget?: number): BudgetStatus | null {
  if (typeof charBudget !== 'number' || charBudget <= 0) return null
  const length = [...value].length
  return { budget: charBudget, length, over: length > charBudget }
}
