import type { CollectionAfterChangeHook } from 'payload'

import { transcriptSourceWhere } from '@/lib/meditations/transcriptSource'

/**
 * afterChange: the transcript row follows the recording, and only the recording.
 *
 * #897's 2026-10-12 Decision — transcribed "by itself when a recording is
 * added". A **replacement** deletes the old row before creating the new one:
 * cues produced from a recording nobody can hear any more are misleading, not
 * history (review, #968).
 *
 * This is the whole of `meditations`' part. It creates and deletes a row;
 * queueing the run belongs to the transcript's own afterChange, so a row cannot
 * exist without a request behind it.
 */
export const syncMeditationTranscript: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const audioFilename = doc.filename
  if (!audioFilename || previousDoc?.filename === audioFilename) return doc

  // `source` is unique, so there is at most one row to find.
  const { docs } = await req.payload.find({
    collection: 'transcripts',
    where: transcriptSourceWhere('meditations', Number(doc.id)),
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const existing = docs[0]
  if (existing) {
    if (existing.audioFilename === audioFilename) return doc
    await req.payload.delete({
      collection: 'transcripts',
      id: existing.id,
      overrideAccess: true,
      req,
    })
  }

  await req.payload.create({
    collection: 'transcripts',
    data: {
      source: { relationTo: 'meditations', value: Number(doc.id) },
      audioFilename,
      language: doc.locale,
    },
    depth: 0,
    overrideAccess: true,
    req,
  })

  return doc
}
