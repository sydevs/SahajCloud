/**
 * The schedule field's recurrence vocabulary, and the one reader of a caller's
 * own recurrence control.
 *
 * Its own module, free of Payload and zod, because the admin form reads it in
 * the browser too: the schedule summary and the interval's label both follow the
 * control as the editor changes it, before any save writes `recurrenceType`.
 */

export const RECURRENCE_OPTIONS = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
] as const

export type Recurrence = (typeof RECURRENCE_OPTIONS)[number]['value']

/**
 * The recurrence a caller's own control stores, or `undefined` where it names
 * none — a one-off, an on-demand class.
 *
 * The one reader of that vocabulary, so the form's conditions and the caller's
 * own write hook cannot answer differently. A caller derives its options from
 * `RECURRENCE_OPTIONS`, which is what makes the lowercase spelling match.
 */
export function recurrenceForRepeats(value: unknown): Recurrence | undefined {
  const recurrence = typeof value === 'string' ? value.toUpperCase() : undefined
  return RECURRENCE_OPTIONS.find((option) => option.value === recurrence)?.value
}
