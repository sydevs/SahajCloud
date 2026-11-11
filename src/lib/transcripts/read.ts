import type { PayloadRequest } from 'payload'

import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Subtitles } from '@/lib/utilities/subtitles'

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
      where: { source: { equals: { relationTo: 'files', value: fileId } } },
      select: { segments: true },
      depth: 0,
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    return (docs[0]?.segments as Subtitles | null | undefined) ?? null
  })
}
