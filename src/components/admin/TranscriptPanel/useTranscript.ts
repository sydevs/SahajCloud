'use client'

import { useLocale } from '@payloadcms/ui'
import useSWR from 'swr'

import { type PayloadList, payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'
import { transcriptPhase, type TranscriptPhase } from '@/lib/transcripts/bounds'
import type { RecordingCollection } from '@/lib/transcripts/media'
import type { Transcript } from '@/payload-types'

import { transcribeUrl, transcriptUrl } from './transcriptModel'
import { useTranscriptPhase } from './useTranscriptPhase'

const POLL_INTERVAL_MS = 3000

type TranscriptList = PayloadList<Transcript>

const readTranscripts = payloadListFetcher<Transcript>

const rowOf = (list: TranscriptList | undefined): Transcript | undefined => list?.docs?.[0]

/**
 * Poll only while a transcription is on its way. The stall bound settles the
 * other end: a run nothing will finish reads `stalled`, so this cannot poll
 * forever — but only because `useTranscriptPhase` renders the moment the bound
 * passes. A poll alone never reaches it.
 *
 * ⚠ **Declared once, at module scope.** SWR lists `refreshInterval` in its
 * polling effect's dependencies, so a new arrow each render re-arms the timer
 * from zero — and the playhead re-renders the transcript several times a
 * second while the recording plays, more often than the interval. An inline
 * arrow would therefore stop the poll exactly while the editor is listening.
 */
const pollInterval = (latest?: TranscriptList): number =>
  transcriptPhase(rowOf(latest)) === 'pending' ? POLL_INTERVAL_MS : 0

export type TranscriptState = {
  /** `null` without a recording id or an admin locale — `transcriptUrl` says why. */
  url: string | null
  /** False until the first read answers. */
  loaded: boolean
  error: unknown
  row: Transcript | undefined
  phase: TranscriptPhase
  /** Where a retry posts, or `null` where `url` is (`transcribeUrl`). */
  transcribeUrl: string | null
  /** Read the row again, which restarts the poll. */
  reread: () => void
}

/**
 * A recording's transcript row, read off the collection rather than the
 * recording's `transcript` join: that join resolves once at page load, so a
 * panel built on it could never show a run finishing.
 *
 * ⚠ **It polls where `JobStageView` deliberately does not.** That view serves
 * a row's own Edit page, opened once; this one sits beside a player an editor
 * is listening to while a run finishes.
 */
export function useTranscript(
  relationTo: RecordingCollection,
  recordingId: number | string | undefined,
): TranscriptState {
  const { code } = useLocale()
  const url = transcriptUrl(recordingId, code, relationTo)
  const { data, error, mutate } = useSWR(url, readTranscripts, {
    refreshInterval: pollInterval,
    revalidateOnFocus: false,
  })
  const row = rowOf(data)
  const phase = useTranscriptPhase(row)
  return {
    error,
    loaded: data !== undefined,
    phase,
    // SWR's own re-read, not `router.refresh()`: this state is SWR's, not the
    // route's. It restarts the poll (`pollInterval`).
    reread: () => void mutate(),
    row,
    transcribeUrl: transcribeUrl(recordingId, code, relationTo),
    url,
  }
}
