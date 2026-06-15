/**
 * Re-verification cadence helpers.
 *
 * The verification period is the event manager's `event_verification`
 * notification frequency — that cadence IS the re-verification window. There
 * is no per-event override and no opt-out; an unset/unknown cadence falls back
 * to `3 Months` (Atlas's historical default).
 */

/** Manager `event_verification` frequency → period length in days. */
export const VERIFICATION_PERIOD_DAYS: Record<string, number> = {
  Monthly: 30,
  '3 Months': 90,
  '6 Months': 180,
}

/** Fallback when a manager has no (or an unrecognised) cadence configured. */
export const DEFAULT_VERIFICATION_PERIOD_DAYS = 90

/** Resolve a manager's cadence string to a period length in days. */
export function verificationPeriodDays(frequency?: string | null): number {
  if (frequency && frequency in VERIFICATION_PERIOD_DAYS) {
    return VERIFICATION_PERIOD_DAYS[frequency]
  }
  return DEFAULT_VERIFICATION_PERIOD_DAYS
}

/** Add `days` to `from`, returning a new Date (UTC-ms arithmetic). */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
}
