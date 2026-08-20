import type { Event } from '@/payload-types'

/**
 * What a submission would make the event look like.
 *
 * One merge, three consumers — the diff the reviewer reads
 * (`ProposedChangesField`), the live preview they see (`previewEvent`), and the
 * write Accept performs (`applyReview`). Keeping them on one function is the
 * point: a diff that disagreed with what Accept actually wrote would be worse
 * than no diff at all.
 *
 * Shallow by design. `proposed` is an Events data *patch*, and Payload's own
 * update semantics are field-wise — a proposed `schedule` replaces the target's
 * schedule wholesale rather than merging into it, which is what "the submitter
 * is proposing this schedule" means. Deep-merging would invent a hybrid neither
 * party asked for.
 */

/** An Events data patch: keys are Events field names, validated on the way in. */
export type ProposedPatch = Record<string, unknown>

/**
 * Baseline for a submission that proposes a brand-new event — the same
 * defaults `applyReview` creates it with, so the preview isn't optimistic
 * about fields the submitter never supplied.
 */
export const NEW_EVENT_DEFAULTS: ProposedPatch = {
  languages: ['en'],
  eventType: 'offline',
  verificationStage: 'unverified',
  manager: null,
}

/**
 * Merge a proposal onto its target. `target` is the existing event for an
 * update proposal, or omitted for a new-event submission (which starts from
 * {@link NEW_EVENT_DEFAULTS}).
 */
export function mergeProposal(args: {
  proposed: ProposedPatch | null | undefined
  target?: Partial<Event> | null
}): ProposedPatch {
  const base: ProposedPatch = args.target ?? NEW_EVENT_DEFAULTS
  return { ...base, ...(args.proposed ?? {}) }
}
