/**
 * What screening recorded about a user message, and how it reads.
 *
 * A leaf module, for the same reason as `EventSubmissions/screening.ts`: the
 * job writes this shape and the admin banner renders it, and neither imports
 * the other (the job pulls DNS and the mailer; the banner is a client
 * component).
 *
 * **The job writes the sentences, not the component.** Screening is the only
 * party that knows *why* it decided what it did — which check matched, how many
 * prior messages it counted — so it composes the whole note. The enums are
 * still stored for triage and querying; they are simply not what gets rendered.
 *
 * Deliberately *not* shared with `EventSubmissions/screening.ts`. The two
 * intakes overlap on one step (the email verdict) and the wording does not
 * survive the move: an event submission's note ends "…and check this event is
 * real", which is meaningless for a message somebody sent us. Sharing the enum
 * would have forced sharing the copy, and the copy is the part that has to be
 * about the domain.
 */

/** Why a message was refused, or `ok`. One reason — the first check that hit. */
export type MessageVerdict =
  | 'ok'
  | 'disposable_email'
  | 'invalid_email'
  | 'no_mx_records'
  | 'repeat_sender'
  | 'duplicate_body'

/**
 * A `type` alias rather than an `interface`, deliberately: TypeScript gives
 * implicit index signatures to type aliases of object types but not to
 * interfaces, and without one this shape is not assignable to a Payload JSON
 * field's value. The alternative was a cast at every write site.
 */
export type UserMessageScreeningResult = {
  /** `ok`, or why the message was classified spam. */
  verdict: MessageVerdict
  /**
   * Everything an admin needs, as complete sentences. Each says what happened
   * *and* what follows from it. A delivered message normally has none.
   */
  notes?: string[]
  /**
   * A technical detail kept for triage and **not rendered** — an MX lookup that
   * came back inconclusive, or the mail transport's own error string. It reads
   * like a machine talking, which is precisely what the notes must not; but
   * discarding it would leave nothing to look at when delivery goes wrong.
   */
  diagnostic?: string
  screenedAt: string
}

/**
 * Why a message was classified spam, in a sentence an admin can act on. Empty
 * for `ok`.
 *
 * Says what it means rather than what was measured — "no MX records" is a fact
 * about DNS, and what the reader needs to know is that no reply could ever
 * reach this person. The consequences (kept, not delivered) are not repeated:
 * the banner already says Marked Spam.
 */
export function messageVerdictNote(verdict: MessageVerdict): string | null {
  switch (verdict) {
    case 'disposable_email':
      return 'The sender used a temporary throwaway email address, so a reply could never reach them.'
    case 'invalid_email':
      return 'The address the sender gave is not a real email address, so a reply could never reach them.'
    case 'no_mx_records':
      return 'The sender’s email address cannot receive mail, so a reply could never reach them.'
    case 'repeat_sender':
      return 'This sender has sent an unusual number of messages in a short time, which is how bulk mail behaves.'
    case 'duplicate_body':
      return 'The identical message was already sent to us recently, which is how bulk mail behaves.'
    case 'ok':
      return null
  }
}
