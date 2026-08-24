/**
 * What screening recorded, and how it reads.
 *
 * A leaf module: the job writes this shape and the admin banner renders it, and
 * neither imports the other (the job pulls Sentry, Mapbox and the mailer; the
 * banner is a client component). Previously the shape was declared in the job
 * and *re-declared*, untyped, in the component — which is how the two drifted
 * far enough that a malformed `emailVerdict` 500'd the edit view.
 *
 * **The job writes the sentences, not the component.** Screening is the only
 * party that knows *why* it decided what it did — which list matched, which
 * city it created, whether anyone was notified — so it composes the whole
 * note. The banner used to stitch a line together from an enum
 * (`Email verdict: disposable email`), which read like a debug dump and left
 * a reviewer to infer the consequence. The enums are still stored for triage
 * and querying; they are simply not what gets rendered.
 */

/** Whether the submitter's address can receive mail, and why not. */
export type EmailVerdict = 'ok' | 'disposable_email' | 'invalid_email' | 'no_mx_records'

/** How a new-event submission's region was resolved. */
export type RegionOutcome = 'anchor' | 'matched' | 'created' | 'unresolved'

export interface ScreeningResult {
  /** `ok`, or why the submission was classified spam. */
  emailVerdict: EmailVerdict
  /** Absent for update proposals, which inherit their event's region. */
  region?: RegionOutcome
  /**
   * Everything the reviewer needs, as complete sentences, in the order
   * screening found them. Each says what happened *and* what follows from it,
   * and nothing appears here that asks nothing of them — no delivery
   * bookkeeping, no lookup internals. Most submissions have none.
   */
  notes?: string[]
  /**
   * A technical detail from the address lookup, kept for triage and
   * **not rendered**. It reads like a machine talking (an HTTP status, a
   * Mapbox message), which is precisely what the notes must not; but
   * discarding it would leave nothing to look at when a region resolves
   * oddly.
   */
  diagnostic?: string
  screenedAt: string
}

/**
 * Why a submission was classified spam, in a sentence a non-technical manager
 * can act on. Empty for `ok`.
 *
 * Deliberately says what it means rather than what was measured — "no MX
 * records" is a fact about DNS, and what the reviewer needs to know is that
 * nobody can be reached at that address to confirm the event is real. The
 * consequences (kept for abuse tracking, nobody notified) are not repeated
 * here: the banner already says Marked Spam, and a manager has no use for the
 * bookkeeping.
 */
export function emailVerdictNote(verdict: EmailVerdict): string | null {
  switch (verdict) {
    case 'disposable_email':
      return 'The submitter used a temporary throwaway email address, so there is no way to reach them and check this event is real.'
    case 'invalid_email':
      return 'The email address the submitter gave is not a real address, so there is no way to reach them and check this event is real.'
    case 'no_mx_records':
      return 'The submitter’s email address cannot receive mail, so there is no way to reach them and check this event is real.'
    case 'ok':
      return null
  }
}

/**
 * What the reviewer has to do about the region, or nothing.
 *
 * Only the two outcomes that need a decision speak. A matched city and a
 * submitter-chosen anchor are the unremarkable cases, and the Region field
 * below the banner already names whichever one it is — repeating it as a
 * bullet gave a manager something to read that asked nothing of them.
 */
export function regionOutcomeNote(outcome: RegionOutcome, cityName?: string | null): string | null {
  const city = cityName?.trim()
  switch (outcome) {
    case 'unresolved':
      return 'We could not match this address to a city, so no region has been set. Choose one below before accepting — a new event needs one.'
    case 'created':
      return city
        ? `“${city}” did not exist yet, so it was added. Check the Region below looks right before accepting.`
        : 'No existing city matched, so a new one was added. Check the Region below looks right before accepting.'
    case 'matched':
    case 'anchor':
      return null
  }
}
