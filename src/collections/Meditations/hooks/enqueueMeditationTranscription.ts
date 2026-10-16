import type { CollectionAfterChangeHook } from 'payload'

import { requestTranscription } from '@/collections/MeditationTranscripts/requestTranscription'

/** Guards against a nested write re-entering this hook. */
const CONTEXT_KEY = 'enqueuedMeditationTranscription'

/**
 * afterChange: transcribe a recording the moment it is added.
 *
 * #897's 2026-10-12 Decision — "by itself when a recording is added, with a
 * button to redo it". A **replacement** takes the button instead: it marks the
 * row outdated (`markTranscriptOutdated`) and queues nothing, because
 * re-transcribing would destroy the old text line 9 keeps readable.
 *
 * The job row is queued **inside the caller's transaction** (`req` passed), so a
 * rolled-back save never leaves an orphaned job — which is also why the queue
 * run is delayed. `requestTranscription` owns that contract.
 */
export const enqueueMeditationTranscription: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (req.context[CONTEXT_KEY]) return doc
  // Audio added where there was none. A replacement has both.
  if (!doc.filename || previousDoc?.filename) return doc

  req.context[CONTEXT_KEY] = true
  await requestTranscription({
    req,
    meditationId: Number(doc.id),
    audioFilename: doc.filename,
    language: doc.locale,
    delayMs: 2000,
  })

  return doc
}
