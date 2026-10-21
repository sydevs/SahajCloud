'use client'

import type { UIFieldClientComponent } from 'payload'

import { Banner, Spinner, useDocumentInfo, useLocale } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { memo, useMemo, useRef } from 'react'
import useSWR from 'swr'

import { formatTime, usePlaybackTime, useSeekToTime } from '@/components/admin/FrameEditor'
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import {
  transcriptPhase,
  type TranscriptPhase,
  transcriptPhaseIsRetryable,
} from '@/lib/meditations/transcriptBounds'
import type { MeditationTranscript as TranscriptRow } from '@/payload-types'

import styles from './MeditationTranscript.module.css'
import { RetryTranscript } from './RetryTranscript'
import {
  activeSegmentIndex,
  groupTranscript,
  seekSecond,
  type TranscriptParagraph,
  transcriptUrl,
} from './transcriptModel'
import { useFollowPlayhead } from './useFollowPlayhead'
import { useTranscriptPhase } from './useTranscriptPhase'

const POLL_INTERVAL_MS = 3000

type TranscriptList = { docs?: TranscriptRow[] }

const rowOf = (list: TranscriptList | undefined): TranscriptRow | undefined => list?.docs?.[0]

/**
 * Poll only while a transcription is on its way. The stall bound settles the
 * other end: a run nothing will finish reads `stalled`, so this cannot poll
 * forever — but only because `useTranscriptPhase` renders the moment the bound
 * passes. A poll alone never reaches it.
 *
 * ⚠ **Declared once, at module scope.** SWR lists `refreshInterval` in its
 * polling effect's dependencies, so a new arrow each render re-arms the timer
 * from zero — and the playhead re-renders this component about once a second
 * while the recording plays, more often than the interval. An inline arrow
 * would therefore stop the poll exactly while the editor is listening.
 */
const pollInterval = (latest?: TranscriptList): number =>
  transcriptPhase(rowOf(latest)) === 'pending' ? POLL_INTERVAL_MS : 0

type Notice = {
  type: 'error' | 'info'
  heading?: string
  /** Absent on `failed`, whose sentence is the run's own `error`. */
  detail?: string
  spinner?: boolean
}

/**
 * The four phases with nothing to read, as one table of `Banner`s — the parts
 * `JobStageView.tsx:75` builds the same notice from. Declared rather than
 * branched so the four cannot drift into three kinds of thing.
 *
 * ⚠ **Which of them offer a retry is not a column here.**
 * `transcriptPhaseIsRetryable` answers that, and the endpoint refuses from the
 * same function — a column would be a second copy of the rule, free to
 * disagree with no test failing.
 */
const NOTICES: Record<Exclude<TranscriptPhase, 'completed'>, Notice> = {
  failed: { heading: 'Transcription failed.', type: 'error' },
  none: {
    detail: 'No transcript yet. One is made automatically when a recording is added.',
    type: 'info',
  },
  pending: {
    detail: 'Turning the recording into a timestamped transcript.',
    heading: 'Transcription in progress.',
    spinner: true,
    type: 'info',
  },
  stalled: {
    detail: 'It has not finished, and nothing is still working on it.',
    heading: 'Transcription stopped responding.',
    type: 'error',
  },
}

async function readTranscripts(url: string): Promise<TranscriptList> {
  const response = await fetch(url, { credentials: 'include' })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message
    throw new Error(message ?? `The server answered ${response.status}.`)
  }
  return body as TranscriptList
}

/**
 * The meditation's Transcript tab: read the recording's transcript as timed
 * paragraphs, follow it as the live preview plays, and click or key a phrase
 * to play from there.
 *
 * It reads the collection rather than the `meditations.transcript` join, which
 * carries the same row: that join resolves once at page load, so a tab built
 * on it could never show a run finishing.
 *
 * ⚠ **This tab polls where `JobStageView` deliberately does not.** That view
 * serves a row's own Edit page, opened once; this one sits beside a player an
 * editor is listening to while a run finishes.
 */
export const MeditationTranscript: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const { code } = useLocale()
  const url = transcriptUrl(id, code)

  const { data, error, mutate } = useSWR(url, readTranscripts, {
    refreshInterval: pollInterval,
    revalidateOnFocus: false,
  })

  const playheadSeconds = usePlaybackTime()
  const seekTo = useSeekToTime()
  const row = rowOf(data)
  // Two memos, not one: `react-hooks/preserve-manual-memoization` refuses a
  // dependency it cannot prove stable, so the cue array needs its own.
  const segments = useMemo(() => row?.segments ?? [], [row])
  const paragraphs = useMemo(() => groupTranscript(segments), [segments])
  const active = activeSegmentIndex(segments, playheadSeconds)
  const container = useRef<HTMLDivElement>(null)
  useFollowPlayhead(container, active, segments.length > 0)
  const phase = useTranscriptPhase(row)

  if (!url) {
    return <Banner type="error">The transcript cannot load without an admin locale.</Banner>
  }
  if (error) {
    return (
      <Banner type="error">
        Could not load the transcript. {error instanceof Error ? error.message : ''}
      </Banner>
    )
  }
  if (!data) return <Spinner loadingText="Loading the transcript…" size="sm" />

  const notice = phase === 'completed' ? undefined : NOTICES[phase]

  return (
    <div className={styles.transcript}>
      <div aria-live="polite" className={styles.status} role="status">
        {notice && (
          <Banner
            icon={notice.spinner ? <Spinner loadingText={null} size="sm" /> : undefined}
            type={notice.type}
          >
            {notice.heading && <strong>{notice.heading}</strong>} {notice.detail ?? row?.error}{' '}
            {transcriptPhaseIsRetryable(phase) && id && (
              <RetryTranscript meditationId={id} onRetried={mutate} requestedAt={row?.createdAt} />
            )}
          </Banner>
        )}
      </div>
      {/* The cues decide, never `status`: `deriveTranscriptStatus` answers
          `completed` from the cues alone, so gating on the string could
          disagree with what there is to read. */}
      {segments.length > 0 && (
        <div className={styles.paragraphs} ref={container}>
          {paragraphs.map((paragraph) => (
            <Paragraph
              activeIndex={paragraph.segmentIndexes.includes(active) ? active : -1}
              key={paragraph.segmentIndexes[0]}
              onSeek={seekTo}
              paragraph={paragraph}
              segments={segments}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Memoized, so the playhead re-renders only the paragraph it moves through. */
const Paragraph = memo(function Paragraph({
  paragraph,
  segments,
  activeIndex,
  onSeek,
}: {
  paragraph: TranscriptParagraph
  segments: TranscriptSegment[]
  activeIndex: number
  onSeek: (seconds: number) => void
}) {
  const start = seekSecond(paragraph.startTimeMs)
  return (
    <section className={styles.paragraph}>
      <button
        aria-label={`Play from ${formatTime(start)}`}
        className={styles.timestamp}
        onClick={() => onSeek(start)}
        type="button"
      >
        {formatTime(start)}
      </button>
      <p className={styles.text}>
        {paragraph.segmentIndexes.map((index) => {
          const play = () => onSeek(seekSecond(segments[index].startTimeMs))
          return (
            <React.Fragment key={index}>
              <span
                aria-current={index === activeIndex ? 'true' : undefined}
                className={styles.phrase}
                onClick={play}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  play()
                }}
                role="button"
                tabIndex={0}
              >
                {segments[index].content}
              </span>{' '}
            </React.Fragment>
          )
        })}
      </p>
      {paragraph.silenceAfter && (
        <p className={styles.silence}>
          {/* lucide, because Payload's icon set has no sound wave */}
          <AudioLines aria-hidden="true" size={16} strokeWidth={1.5} />A moment of silence
        </p>
      )}
    </section>
  )
})

export default MeditationTranscript
