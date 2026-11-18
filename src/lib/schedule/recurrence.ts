/**
 * The schedule field's recurrence vocabulary, and the one reader of it.
 *
 * Its own module, free of Payload and zod, because the admin form reads it in
 * the browser too: where a caller owns the recurrence control, the schedule
 * summary and the interval's label follow that control as the editor changes
 * it, since `recurrenceType` is only written on save.
 */

export const RECURRENCE_OPTIONS = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
] as const

export type Recurrence = (typeof RECURRENCE_OPTIONS)[number]['value']

/**
 * The recurrence a value names, in either case — the stored `recurrenceType`
 * or a caller's own control, whose options are the lowercase spelling — or
 * `undefined` where it names none: a one-off, an on-demand class.
 *
 * The one reader, so the form's conditions and the caller's own write hook
 * cannot answer differently.
 */
export function parseRecurrence(value: unknown): Recurrence | undefined {
  const recurrence = typeof value === 'string' ? value.toUpperCase() : undefined
  return RECURRENCE_OPTIONS.find((option) => option.value === recurrence)?.value
}
