import type { JSONSchema4 } from 'json-schema'

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

/**
 * Why a message was refused, or `ok`. One reason — the first check that hit.
 *
 * A runtime list as well as a type, because the verdict is read back out of a
 * JSON column: `ScreenUserMessages` restores a stored result on a retry, and a
 * value that isn't one of these means the column holds something this code did
 * not write.
 */
export const MESSAGE_VERDICTS = [
  'ok',
  'disposable_email',
  'invalid_email',
  'no_mx_records',
  'repeat_sender',
  'duplicate_body',
] as const

export type MessageVerdict = (typeof MESSAGE_VERDICTS)[number]

/**
 * JSON Schema for the stored `screeningResult`, wired onto that field. Payload
 * generates `UserMessage['screeningResult']` from it **and** compiles it to a
 * write-time validator, so the shape has one definition instead of a hand-kept
 * type alias beside a column that accepted anything.
 *
 * Closed (`additionalProperties: false`) because only `ScreenUserMessages`
 * writes here — an unknown key is a bug in the job, not an older server meeting
 * a newer client. `verdict` takes its enum from {@link MESSAGE_VERDICTS}, so the
 * runtime list and the stored contract cannot drift.
 */
export const screeningResultJsonSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'screenedAt'],
  properties: {
    // `description`, not a `//` comment: Payload renders these into the JSDoc on
    // the generated type, so the field documentation survives the move off the
    // hand-written alias.
    verdict: {
      enum: [...MESSAGE_VERDICTS],
      description: '`ok`, or why the message was classified spam.',
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Everything an admin needs, as complete sentences. Each says what happened and what follows from it. A delivered message normally has none.',
    },
    diagnostic: {
      type: 'string',
      description:
        'A technical detail kept for triage and NOT rendered — an MX lookup that came back inconclusive, or the mail transport’s own error string. Discarding it would leave nothing to look at when delivery goes wrong.',
    },
    screenedAt: { type: 'string', description: 'When screening reached this verdict (ISO 8601).' },
  },
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
export const MESSAGE_VERDICT_NOTES: Record<MessageVerdict, string | null> = {
  ok: null,
  disposable_email:
    'The sender used a temporary throwaway email address, so a reply could never reach them.',
  invalid_email:
    'The address the sender gave is not a real email address, so a reply could never reach them.',
  no_mx_records:
    'The sender’s email address cannot receive mail, so a reply could never reach them.',
  repeat_sender:
    'This sender has sent an unusual number of messages in a short time, which is how bulk mail behaves.',
  duplicate_body:
    'The identical message was already sent to us recently, which is how bulk mail behaves.',
}
