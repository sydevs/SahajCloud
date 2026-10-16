import type { CollectionBeforeChangeHook } from 'payload'

import { markTranscriptOutdated } from '@/collections/MeditationTranscripts/requestTranscription'

/**
 * beforeChange: a replaced recording makes the existing transcript out of date,
 * at the moment of the replacement.
 *
 * #897 success line 9 asks for the mark now, not when someone next opens the
 * tab — which is why `outdated` is a stored column (#957) and why this runs
 * here rather than at render.
 *
 * It needs nothing about the new recording. `requestTranscription` writes the
 * new `audioFilename` when the editor asks for a redo, and until then the row's
 * `segments` are the previous recording's and stay readable.
 *
 * ⚠ **This never queues a transcription.** The goal offers a button on a
 * replacement, and re-transcribing here would overwrite the text line 9 keeps.
 */
export const outdateTranscriptOnReplace: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  // `req.file` is the uploaded replacement — the same signal
  // `extractAudioDuration` reads a line above in this chain.
  const replaced = originalDoc?.filename
  if (!req.file || !replaced) return data

  await markTranscriptOutdated(req, Number(originalDoc.id), replaced)

  return data
}
