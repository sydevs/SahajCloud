import type { CollectionAfterChangeHook } from 'payload'

import { syncRecordingTranscript } from '@/lib/transcripts/sync'

/**
 * afterChange: the transcript row follows the recording, and only the recording
 * (`syncRecordingTranscript`). A meditation is one language, so its `locale` is
 * the language the run is asked for.
 */
export const syncMeditationTranscript: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const audioFilename = doc.filename
  if (!audioFilename || previousDoc?.filename === audioFilename) return doc

  await syncRecordingTranscript(req, {
    source: { relationTo: 'meditations', value: Number(doc.id) },
    audioFilename,
    language: doc.locale,
  })

  return doc
}
