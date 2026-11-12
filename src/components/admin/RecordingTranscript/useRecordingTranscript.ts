'use client'

import { useLocale } from '@payloadcms/ui'
import useSWR from 'swr'

import { type PayloadList, payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'
import { transcriptPhase, type TranscriptPhase } from '@/lib/meditations/transcriptBounds'
import type { Transcript } from '@/payload-types'

import { type RecordingCollection, transcriptUrl } from './transcriptModel'
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

export type RecordingTranscriptState = {
  relationTo: RecordingCollection
  recordingId: number | string | undefined
  /** `null` without a recording id or an admin locale — `transcriptUrl` says why. */
  url: string | null
  /** False until the first read answers. */
  loaded: boolean
  error: unknown
  row: Transcript | undefined
  phase: TranscriptPhase
  /** Re-read the row, which restarts the poll. */
  refresh: () => void
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
export function useRecordingTranscript(
  relationTo: RecordingCollection,
  recordingId: number | string | undefined,
): RecordingTranscriptState {
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
    recordingId,
    refresh: mutate,
    relationTo,
    row,
    url,
  }
}
