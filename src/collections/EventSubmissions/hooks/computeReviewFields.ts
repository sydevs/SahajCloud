import type { FieldHook, PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Event } from '@/payload-types'

import { mergeProposal } from '../lifecycle/mergeProposal'
import { buildProposedChanges } from '../lifecycle/proposedChanges'

/**
 * The two read-only projections a reviewer works from:
 *
 * - **`previewEvent`** — the event as this submission would leave it. Payload's
 *   live preview posts form state into the Atlas widget's iframe, so this field
 *   *is* the transport; the widget never reads `event-submissions` (it can't —
 *   the collection is restricted to create-only for API clients).
 * - **`proposedChanges`** — the same merge, diffed against the target, so the
 *   reviewer sees what would actually change rather than a wall of values.
 *
 * Both are virtual: they project `proposed` over a target event that can change
 * underneath the submission, so a stored copy would go stale the moment a
 * manager edited that event.
 *
 * Both skip list reads — 25 rows would mean 25 event lookups for values no list
 * column renders (the `findMany` guard, as in `computeEventQualityReport`).
 */

/**
 * Load the proposal's target event at most once per request. Both hooks below
 * need it, and Payload runs them separately; without this the same row is
 * fetched twice on every read of a submission.
 *
 * Deliberately does **not** forward the caller's `req`. These hooks run during
 * the `afterRead` of a create, so the caller's request is mid-transaction —
 * joining it for a read-only projection aborted the write outright (the
 * submission came back with an id and no row behind it). The projection only
 * needs the event's committed state, so its own connection is the correct one.
 * `req` is still the memo key: one load per request either way.
 */
function loadTargetEvent(req: PayloadRequest, targetId: number): Promise<Event | null> {
  return memoizeOnRequest(req, `submissionTargetEvent:${targetId}`, async () => {
    return (await req.payload
      .findByID({
        collection: 'events',
        id: targetId,
        depth: 0,
        // A proposal can target a trashed or draft-only event; showing the
        // reviewer "no current value" for every field would misrepresent it.
        draft: true,
        trash: true,
        overrideAccess: true,
        disableErrors: true,
      })
      .catch(() => null)) as Event | null
  })
}

/** `previewEvent` — the merged event, for the live-preview iframe. */
export const computePreviewEvent: FieldHook = async ({ data, findMany, req }) => {
  if (findMany) return null

  const proposed = data?.proposed as Record<string, unknown> | null | undefined
  const targetId = relationId(data?.event)
  if (targetId == null) return mergeProposal({ proposed })

  return mergeProposal({ proposed, target: await loadTargetEvent(req, targetId) })
}

/** `proposedChanges` — the field-by-field diff the reviewer reads. */
export const computeProposedChanges: FieldHook = async ({ data, findMany, req }) => {
  if (findMany) return null

  const proposed = data?.proposed as Record<string, unknown> | null | undefined
  const targetId = relationId(data?.event)
  const target = targetId == null ? null : await loadTargetEvent(req, targetId)

  // With no target, `before` is the new-event baseline, so every proposed field
  // reads as an addition — which is exactly what creating a listing is.
  const before = (target ?? mergeProposal({ proposed: null })) as Record<string, unknown>
  const after = mergeProposal({ proposed, target })

  return buildProposedChanges({
    before,
    after,
    fields: req.payload.collections?.events?.config?.flattenedFields,
  })
}
