/**
 * The schedule field's recurrence vocabulary. Its own module, free of Payload
 * and zod, because admin components read it in the browser — Events' own
 * recurrence control draws its choices from it.
 */

export const RECURRENCE_OPTIONS = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
] as const

export type Recurrence = (typeof RECURRENCE_OPTIONS)[number]['value']
