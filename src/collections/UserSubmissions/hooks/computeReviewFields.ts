import type { FieldHook, PayloadRequest } from 'payload'

import { readEventImages, type EventImage } from '@/lib/utilities/eventImages'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Event } from '@/payload-types'

import { mergeProposal, submissionRegionId } from '../lifecycle/mergeProposal'
import { buildProposedChanges } from '../lifecycle/proposedChanges'

/**
 * The two read-only projections a reviewer works from:
 *
 * - **`previewEvent`** — the event as this submission would leave it. Payload's
 *   live preview posts form state into the Atlas widget's iframe, so this field
 *   *is* the transport; the widget never reads the submission itself (it can't —
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
 *
 * ⚠ **Both also guard on `type`.** One table holds four intakes, and a
 * registration names an event too — so without it, every single-document read
 * of a contact, subscribe or registration row pays an `events` findByID plus a
 * diff over the whole Events `flattenedFields` against an empty proposal.
 * `admin.condition` hides the fields; it does not stop the hooks.
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

/**
 * The assigned manager, at most once per request.
 *
 * `data.manager` is still a bare id inside a field `afterRead` — relationship
 * population happens elsewhere in the read — and a diff line reading
 * `Manager: 496` names nobody. Same no-`req` rule as the target event above:
 * a read-only projection uses its own connection.
 */
function loadManager(req: PayloadRequest, managerId: number): Promise<unknown> {
  return memoizeOnRequest(req, `submissionManager:${managerId}`, async () =>
    req.payload
      .findByID({
        collection: 'managers',
        id: managerId,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
      })
      .catch(() => null),
  )
}

/** The manager as something renderable, or the raw id if they've since gone. */
async function resolveManager(req: PayloadRequest, value: unknown): Promise<unknown> {
  const managerId = relationId(value)
  if (managerId == null) return null
  return (await loadManager(req, managerId)) ?? managerId
}

/**
 * The merged event's photographs, at most once per request.
 *
 * Resolved after the merge rather than by raising `loadTargetEvent`'s depth:
 * that load is shared with `computeProposedChanges`, where a populated
 * relationship renders by name instead of by row id and would change the
 * reviewer's diff. Same no-`req` rule as the two loads above.
 */
function loadImages(req: PayloadRequest, imageIds: number[]): Promise<EventImage[]> {
  return memoizeOnRequest(req, `submissionImages:${imageIds.join(',')}`, () =>
    readEventImages(imageIds, { payload: req.payload, overrideAccess: true }).catch(() => []),
  )
}

/**
 * `previewEvent` — the merged event, for the live-preview iframe.
 *
 * What the widget may rely on, given it can never read the collection back:
 *
 * - **`images`** — image documents carrying `url` and `alt`, in the event's
 *   order, and only on an **update** proposal. `images` is privileged, so a
 *   new-event proposal has none to show. An id whose row has gone drops out,
 *   because the widget parses per entry and one bare number would cost it the
 *   whole array.
 * - **`region`** — on a new-event proposal, the id Accept will write.
 * - **everything else** — as `mergeProposal` leaves it.
 */
export const computePreviewEvent: FieldHook = async ({ data, findMany, req }) => {
  if (findMany) return null
  if (data?.type !== 'proposal') return null

  const proposed = data?.proposed as Record<string, unknown> | null | undefined
  const targetId = relationId(data?.event)
  if (targetId == null) {
    const merged = mergeProposal({ proposed, manager: await resolveManager(req, data?.manager) })
    // Accept attaches the listing to this region, and a preview that promised
    // a different one would be the disagreement `mergeProposal` exists to
    // prevent.
    const regionId = submissionRegionId({ region: data?.region, regionHint: data?.regionHint })
    return regionId == null ? merged : { ...merged, region: regionId }
  }

  const merged = mergeProposal({ proposed, target: await loadTargetEvent(req, targetId) })
  const imageIds = (Array.isArray(merged.images) ? merged.images : [])
    .map(relationId)
    .filter((id): id is number => id != null)
  return imageIds.length === 0 ? merged : { ...merged, images: await loadImages(req, imageIds) }
}

/** `proposedChanges` — the field-by-field diff the reviewer reads. */
export const computeProposedChanges: FieldHook = async ({ data, findMany, req }) => {
  if (findMany) return null
  if (data?.type !== 'proposal') return null

  const proposed = data?.proposed as Record<string, unknown> | null | undefined
  const targetId = relationId(data?.event)
  const target = targetId == null ? null : await loadTargetEvent(req, targetId)

  // With no target, `before` is the new-event baseline, so every proposed field
  // reads as an addition — which is exactly what creating a listing is.
  const before = (target ?? mergeProposal({ proposed: null })) as Record<string, unknown>
  // The manager rides on the submission, not the patch, so assigning one shows
  // up here as what it is: the event gains a manager and is created verified.
  // Resolved to the manager's own document, so the line reads as a name
  // rather than `Manager: 496`.
  // Virtual, so it refreshes on read rather than as the reviewer picks — the
  // same trade every field on this page makes (see `docs/rules/admin-ui.md`).
  const after = mergeProposal({
    proposed,
    target,
    manager: await resolveManager(req, data?.manager),
  })

  return buildProposedChanges({
    before,
    after,
    fields: req.payload.collections?.events?.config?.flattenedFields,
  })
}
