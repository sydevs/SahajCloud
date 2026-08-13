import type { JSONSchema4 } from 'json-schema'

/**
 * The `communityFeedback` namespace inside an Event's `systemMeta` JSON —
 * registrant confirm/deny vote tallies for an unverified listing. Written by
 * the Registrations vote-sync hook (alongside the indexed `confidenceScore`
 * column, which stays a real column because the feeds sort on it); read by the
 * admin verification notice.
 *
 * Declared as a JSON Schema rather than parsed by a hand-written reader:
 * Payload generates the TypeScript type from this — so
 * `event.systemMeta?.communityFeedback?.denials` is checked at compile time —
 * and validates it on write, so a malformed tally can't reach the column in the
 * first place. A defensive runtime reader could only report that the data was
 * already wrong. Same mechanism as `Registrations.questions`.
 */
export const communityFeedbackJsonSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  properties: {
    confirmations: {
      type: 'number',
      description: 'Registrants who confirmed the event exists.',
    },
    denials: { type: 'number', description: 'Registrants who denied it.' },
    updatedAt: { type: 'string', description: 'ISO timestamp of the last vote applied.' },
  },
}
