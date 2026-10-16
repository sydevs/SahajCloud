import type { CollectionBeforeChangeHook } from 'payload'

import { findTranscriptRow } from '@/collections/MeditationTranscripts/view'

/**
 * beforeChange: a replaced recording makes the existing transcript out of date,
 * at the moment of the replacement.
 *
 * #897 success line 9 asks for the mark now, not when someone next opens the
 * tab — which is why `outdated` is a stored column (#957) and why this runs
 * here. It passes `req`, so the mark lands in the same transaction: a
 * replacement that rolls back takes the mark with it.
 *
 * It needs nothing about the new recording. `requestTranscription` writes the
 * new `audioFilename` when the editor asks for a redo, and until then the row's
 * `segments` are the previous recording's and stay readable.
 *
 * ⚠ **This never queues a transcription.** The goal offers a button on a
 * replacement, and re-transcribing here would overwrite the text line 9 keeps.
 */
export const markTranscriptOutdated: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  // `req.file` is the uploaded replacement — the same signal
  // `extractAudioDuration` reads a line above in this chain.
  const replaced = originalDoc?.filename
  if (!req.file || !replaced) return data

  const row = await findTranscriptRow(req, Number(originalDoc.id))
  if (!row || row.audioFilename !== replaced || row.outdated) return data

  await req.payload.update({
    collection: 'meditation-transcripts',
    id: row.id,
    data: { outdated: true },
    depth: 0,
    overrideAccess: true,
    req,
  })

  return data
}
