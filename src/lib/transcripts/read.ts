import type { Payload, PayloadRequest, Where } from 'payload'

import { extractID } from 'payload/shared'

import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Subtitles } from '@/lib/utilities/subtitles'

/**
 * The polymorphic `source` clause for one file.
 *
 * ⚠ **One `equals` per file, never `source.value`.** Payload resolves only that
 * spelling, and the bare value would match a meditation of the same number
 * (`Transcripts.ts`).
 */
const fileSource = (fileId: number | string): Where => ({
  source: { equals: { relationTo: 'files', value: fileId } },
})

/** Whether a transcript row already carries its cues. */
export function transcriptHasCues(row: { segments?: unknown } | null | undefined): boolean {
  return Array.isArray(row?.segments) && row.segments.length > 0
}

/**
 * Which of these files have a finished transcript, and the language each is in.
 *
 * One query for the whole set, and `segmentCount` rather than the cues, because
 * the stored count is what says a transcript is finished without serving the
 * column it counts (`Transcripts.ts`).
 *
 * Pass an isolated `req` where a sibling read runs concurrently on the caller's
 * own (`src/collections/AGENTS.md`).
 */
export async function readFinishedFileTranscripts(
  payload: Payload,
  fileIds: Array<number | string>,
  { req }: { req?: PayloadRequest } = {},
): Promise<Array<{ fileId: number | string; language: string | null }>> {
  if (fileIds.length === 0) return []
  const { docs } = await payload.find({
    collection: 'transcripts',
    where: { and: [{ or: fileIds.map(fileSource) }, { segmentCount: { greater_than: 0 } }] },
    select: { source: true, language: true },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs.flatMap((doc) => {
    const value = doc.source?.value
    if (value === null || value === undefined) return []
    return [{ fileId: extractID(value), language: doc.language ?? null }]
  })
}

/**
 * A file's transcript cues, or `null` while it has none — the subtitles every
 * use of the file shows (#1016).
 *
 * Memoized per request and file, so a Path Step and its populated intro file
 * share one read. Reads without `req`: both callers are virtual fields, which
 * project committed state and must not join the transaction of a write they
 * decorate (`src/collections/AGENTS.md`).
 */
export function readFileSubtitles(req: PayloadRequest, fileId: number): Promise<Subtitles | null> {
  return memoizeOnRequest(req, `fileSubtitles:${fileId}`, async () => {
    const { docs } = await req.payload.find({
      collection: 'transcripts',
      where: fileSource(fileId),
      select: { segments: true },
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    return (docs[0]?.segments as Subtitles | null | undefined) ?? null
  })
}
