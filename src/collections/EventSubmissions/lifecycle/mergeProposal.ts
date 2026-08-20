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
 * **Merges the way Payload merges**, which is recursive through groups: a
 * `payload.update` given `{ address: { venueName } }` changes the venue name
 * and leaves street/city/country/coordinates exactly as they were (verified
 * against the running API, not assumed). An earlier version of this replaced a
 * group wholesale, and the diff then told the reviewer that accepting a
 * venue-name correction would erase the address — a diff that disagrees with
 * what Accept actually writes is worse than no diff at all.
 *
 * Arrays are replaced, not merged, because Payload replaces them: a proposed
 * `languages: ['de']` means those languages, not those plus the old ones. An
 * explicit `null` also wins — it is how a patch clears a value.
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
  return mergeInto(base, args.proposed ?? {})
}

/** A group value — merged into. Arrays and nulls are values, and replace. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeInto(base: ProposedPatch, patch: ProposedPatch): ProposedPatch {
  const merged: ProposedPatch = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key]
    merged[key] =
      isPlainObject(existing) && isPlainObject(value) ? mergeInto(existing, value) : value
  }
  return merged
}
