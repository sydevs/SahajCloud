'use client'

import { toast, useLocale } from '@payloadcms/ui'
import { useCallback, useState } from 'react'
import useSWR from 'swr'

import {
  type PayloadList,
  payloadListFetcher,
  refusalMessage,
} from '@/components/admin/helpers/payloadListFetcher'
import { transcriptPhase, type TranscriptPhase } from '@/lib/transcripts/bounds'
import type { RecordingCollection } from '@/lib/transcripts/media'
import type { Transcript } from '@/payload-types'

import { transcribeUrl, transcriptUrl } from './transcriptModel'
import { useTranscriptPhase } from './useTranscriptPhase'

const POLL_INTERVAL_MS = 3000

const REQUEST_FAILED = 'Could not ask for a transcript.'

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
  /** `null` without a recording id or an admin locale — `transcriptUrl` says why. */
  url: string | null
  /** False until the first read answers. */
  loaded: boolean
  error: unknown
  row: Transcript | undefined
  phase: TranscriptPhase
  /** Ask for the recording to be transcribed again, then re-read the row, which restarts the poll. */
  request: () => Promise<void>
  /** A request is on its way. */
  requesting: boolean
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
  const [requesting, setRequesting] = useState(false)

  const request = useCallback(async () => {
    // No locale, no request: one resolves the default locale server-side and
    // reproduces the #701 403 silently — see `transcriptUrl`.
    const target = transcribeUrl(recordingId, code, relationTo)
    if (!target) {
      toast.error(REQUEST_FAILED)
      return
    }
    setRequesting(true)
    try {
      const response = await fetch(target, { credentials: 'include', method: 'POST' })
      const body: unknown = await response.json().catch(() => null)
      if (response.ok) {
        toast.success('Transcribing the recording again.')
      } else {
        toast.error(refusalMessage(body) ?? REQUEST_FAILED)
        // ⚠ **A refusal can mean the row moved on.** A run slower than the
        // stall bound that then finishes reads `stalled` here and `completed`
        // on the server — and nothing polls a phase that offers a retry, so
        // without a re-read the panel keeps a notice the server disagrees
        // with. A 429 is the one refusal that leaves the row as it is here.
        if (response.status === 429) return
      }
      // SWR's own re-read, not `router.refresh()`: this state is SWR's, not
      // the route's. It restarts the poll (`pollInterval`).
      void mutate()
    } catch {
      toast.error(REQUEST_FAILED)
    } finally {
      setRequesting(false)
    }
  }, [code, mutate, recordingId, relationTo])

  return {
    error,
    loaded: data !== undefined,
    phase,
    request,
    requesting,
    row,
    url,
  }
}
