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
   * Everything worth telling the reviewer, as complete sentences, in the
   * order screening found them. Each says what happened *and* what follows
   * from it — a note the reviewer can act on without knowing the codes.
   */
  notes?: string[]
  screenedAt: string
}

/** The note explaining a spam classification. Empty for `ok`. */
export function emailVerdictNote(verdict: EmailVerdict): string | null {
  switch (verdict) {
    case 'disposable_email':
      return 'The submitter used a disposable email address, so this was classified as spam and nobody was notified.'
    case 'invalid_email':
      return 'The submitter’s email address isn’t a valid address, so this was classified as spam and nobody was notified.'
    case 'no_mx_records':
      return 'The submitter’s email domain has no mail servers, so nothing could ever reach them. Classified as spam; nobody was notified.'
    case 'ok':
      return null
  }
}

/**
 * The note explaining how the event's region was decided. `anchor` returns
 * nothing: the submitter picked an existing city themselves, which is the
 * unremarkable case and needs no comment.
 */
export function regionOutcomeNote(outcome: RegionOutcome, cityName?: string | null): string | null {
  const city = cityName?.trim()
  switch (outcome) {
    case 'unresolved':
      return 'No city could be matched to the submitted address, so this submission has no region yet. Set the Region field before accepting — a new event can’t be created without one.'
    case 'created':
      return city
        ? `No existing city matched, so “${city}” was created for this event. Check it looks right before accepting.`
        : 'No existing city matched, so a new one was created for this event. Check it looks right before accepting.'
    case 'matched':
      return city ? `Matched the existing city “${city}”.` : 'Matched an existing city.'
    case 'anchor':
      return null
  }
}
