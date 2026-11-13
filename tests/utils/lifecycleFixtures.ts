import type { CollectionSlug, Payload } from 'payload'

import { hasDraftsEnabled } from 'payload/shared'

import { seedLatestVersion } from './storeInvalidEvent'

/**
 * Put a document at a lifecycle state, as a fixture rather than as a move.
 *
 * ⚠ **Straight to the row, below the hooks.** Each lifecycle's guard refuses a
 * state change that names no writer (#1121), and most states a case needs to
 * start from are nobody's to write twice — a reviewer's own decision, or a
 * ladder step the job reaches over weeks. Writing the column directly says what
 * this is: the state the case starts from, never the transition under test.
 * Same reason `storeInvalidEvent` exists.
 *
 * ⚠ **Use it for the setup, never for the behaviour.** A case asserting that a
 * writer may make a move has to make the move, or it asserts nothing about the
 * guard.
 *
 * ⚠ **A collection carrying drafts needs its `latest: true` version row too**,
 * which is why this delegates to `seedLatestVersion`: `updateByID` loads the
 * document it is about to write from that row, so seeding the main row alone
 * leaves the next ordinary save putting the old state back.
 */
export function setLifecycleState(args: {
  payload: Payload
  collection: CollectionSlug
  id: number
  data: Record<string, unknown>
}): Promise<unknown> {
  const { payload, collection, id, data } = args
  if (hasDraftsEnabled(payload.collections[collection]?.config)) {
    // `seedLatestVersion` is typed to the two collections its own callers seed;
    // the body is slug-agnostic, and a collection with no version row throws
    // there rather than seeding half a document.
    return seedLatestVersion(payload, collection as 'events', id, data)
  }
  return payload.db.updateOne({ collection, where: { id: { equals: id } }, data } as never)
}
