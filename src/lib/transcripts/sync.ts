import type { PayloadRequest } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { TranscriptSegment } from '@/lib/meditations/transcript'

/** A recording a transcript can belong to: its own upload row. */
export type TranscriptSource = { relationTo: 'meditations' | 'files'; value: number }

/**
 * Make the recording's transcript row follow its current file, and nothing else.
 *
 * #897's 2026-10-12 Decision — transcribed "by itself when a recording is
 * added". A **replacement** deletes the old row before creating the new one:
 * cues produced from a recording nobody can hear any more are misleading, not
 * history (review, #968).
 *
 * It creates and deletes a row; queueing the run belongs to the transcript's own
 * afterChange (`queueTranscription`), so a row cannot exist without a request
 * behind it. Called with the caller's `req`, so the row commits or rolls back
 * with the save that added the recording.
 *
 * `language` is `null` where nobody knows it yet — a file, whose language the
 * run detects (#1016) — and the meditation's own `locale` otherwise.
 *
 * `importedSegments` are cues that already exist for the recording, such as a
 * Path Step's hand-made Storyblok subtitles. A row created with cues queues no
 * run (`queueTranscription`), so the vendor is not paid to redo them.
 */
export async function syncRecordingTranscript(
  req: PayloadRequest,
  {
    source,
    audioFilename,
    language,
    importedSegments,
  }: {
    source: TranscriptSource
    audioFilename: string
    language: LocaleCode | null
    importedSegments?: TranscriptSegment[]
  },
): Promise<void> {
  // `source` is unique, so there is at most one row to find.
  const { docs } = await req.payload.find({
    collection: 'transcripts',
    where: { source: { equals: source } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  const existing = docs[0]
  if (existing) {
    if (existing.audioFilename === audioFilename) return
    await req.payload.delete({
      collection: 'transcripts',
      id: existing.id,
      overrideAccess: true,
      req,
    })
  }

  await req.payload.create({
    collection: 'transcripts',
    data: importedSegments?.length
      ? { source, audioFilename, language, provider: 'imported', segments: importedSegments }
      : { source, audioFilename, language },
    depth: 0,
    overrideAccess: true,
    req,
  })
}
