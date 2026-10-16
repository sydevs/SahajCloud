import type { CollectionAfterChangeHook } from 'payload'

import { requestTranscription } from '@/collections/MeditationTranscripts/requestTranscription'

/**
 * afterChange: transcribe a recording the moment it is added.
 *
 * #897's 2026-10-12 Decision — "by itself when a recording is added, with a
 * button to redo it". A **replacement** takes the button instead: it marks the
 * row outdated (`outdateTranscriptOnReplace`) and queues nothing, because
 * re-transcribing would destroy the old text line 9 keeps readable.
 *
 * The job row is queued **inside the caller's transaction** (`req` passed), so a
 * rolled-back save never leaves an orphaned job — which is also why the queue
 * run says `afterCommit`. `requestTranscription` owns that contract.
 */
export const enqueueMeditationTranscription: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  // Audio added where there was none. A replacement has both, and a create
  // carries no `previousDoc` at all.
  if (!doc.filename || previousDoc?.filename) return doc

  await requestTranscription({
    req,
    meditationId: Number(doc.id),
    audioFilename: doc.filename,
    language: doc.locale,
    afterCommit: true,
  })

  return doc
}
