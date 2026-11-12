import type { RecordingCollection } from './media'
import type { Payload, PayloadRequest, Where } from 'payload'

import { extractID } from 'payload/shared'

import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { Subtitles } from '@/lib/utilities/subtitles'
import type { Transcript } from '@/payload-types'

/** A recording a transcript can belong to: its own upload row. */
export type TranscriptSource = { relationTo: RecordingCollection; value: number }

/**
 * The `where` naming one recording's transcript row.
 *
 * ⚠ **Always this spelling, never `source.value`.** Payload resolves only an
 * `equals` on the whole pair, and the bare value would match a meditation and
 * a file of the same number (`Transcripts.ts`).
 */
export const whereSource = (source: {
  relationTo: RecordingCollection
  value: number | string
}): Where => ({ source: { equals: source } })

const fileSource = (fileId: number | string): Where =>
  whereSource({ relationTo: 'files', value: fileId })

/**
 * The recording's transcript row. `source` is unique, so there is at most one.
 *
 * ⚠ **No `select`, because the row has to arrive whole.** `status` is virtual,
 * computed by its own `afterRead` from `segmentCount` and `job`
 * (`Transcripts.ts`), so a `select` would starve that hook and every row would
 * read `completed`.
 */
export async function findTranscript(
  req: PayloadRequest,
  source: TranscriptSource,
): Promise<Transcript | undefined> {
  const { docs } = await req.payload.find({
    collection: 'transcripts',
    where: whereSource(source),
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs[0]
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
 * ⚠ **Batched, because its caller is a per-row read on a bulk operation.** The
 * field hook behind it cannot take Payload's `findMany` guard: a populated
 * upload is read by a `find` (`payload/dist/collections/dataloader.js`), which
 * is exactly the read the app's Path Step query needs. Without the batch, one
 * `files` page pays one `transcripts` query per audio or video row. Every call
 * landing in the same tick resolves from a single query, and a later one opens
 * the next batch.
 *
 * Memoized per request and file on top of that, so a Path Step and its
 * populated intro file share one answer. Reads without `req`: both callers are
 * virtual fields, which project committed state and must not join the
 * transaction of a write they decorate (`src/collections/AGENTS.md`).
 */
export function readFileSubtitles(req: PayloadRequest, fileId: number): Promise<Subtitles | null> {
  return memoizeOnRequest(req, `fileSubtitles:${fileId}`, async () => {
    const cues = await joinSubtitlesBatch(req, fileId)
    return cues.get(fileId) ?? null
  })
}

type SubtitlesBatch = { ids: Set<number>; cues: Promise<Map<number, Subtitles>> }

const BATCH_KEY = 'fileSubtitlesBatch'

function joinSubtitlesBatch(req: PayloadRequest, fileId: number): Promise<Map<number, Subtitles>> {
  const ctx = (req.context ?? {}) as Record<string, unknown>
  req.context = ctx
  let batch = ctx[BATCH_KEY] as SubtitlesBatch | undefined
  if (!batch) {
    const ids = new Set<number>()
    // The open batch is dropped from the request as it closes, so a caller
    // arriving later opens its own rather than awaiting a query already sent.
    // Nothing else writes this key, so the batch under it here is this one.
    const cues = Promise.resolve().then(() => {
      delete ctx[BATCH_KEY]
      return loadSubtitles(req, [...ids])
    })
    batch = { ids, cues }
    ctx[BATCH_KEY] = batch
  }
  batch.ids.add(fileId)
  return batch.cues
}

async function loadSubtitles(
  req: PayloadRequest,
  fileIds: number[],
): Promise<Map<number, Subtitles>> {
  const cues = new Map<number, Subtitles>()
  if (fileIds.length === 0) return cues
  const { docs } = await req.payload.find({
    collection: 'transcripts',
    where: { or: fileIds.map(fileSource) },
    select: { source: true, segments: true },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  for (const doc of docs) {
    const value = doc.source?.value
    const segments = doc.segments as Subtitles | null | undefined
    if (value === null || value === undefined || !segments?.length) continue
    cues.set(Number(extractID(value)), segments)
  }
  return cues
}
