'use client'

import type { Playback } from './playback'
import type { RecordingTranscriptState } from './useRecordingTranscript'

import { Collapsible, Spinner } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { memo, useMemo, useRef } from 'react'

import { formatTime } from '@/components/admin/FrameEditor'
import { InfoBanner, type InfoBannerType } from '@/components/admin/InfoBanner'
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import {
  type TranscriptPhase,
  transcriptPhaseIsRetryable,
} from '@/lib/meditations/transcriptBounds'

import styles from './RecordingTranscript.module.css'
import { RetryTranscript } from './RetryTranscript'
import {
  activeSegmentIndex,
  groupTranscript,
  seekSecond,
  type TranscriptParagraph,
} from './transcriptModel'
import { useFollowPlayhead } from './useFollowPlayhead'

type Notice = {
  type: InfoBannerType
  title: string
  /** Absent on `failed`, whose sentence is the run's own `error`. */
  detail?: string
  spinner?: boolean
}

/**
 * The four phases with nothing to read, as one table of notices. Declared
 * rather than branched so the four cannot drift into three kinds of thing.
 *
 * ⚠ **Which of them offer a retry is not a column here.**
 * `transcriptPhaseIsRetryable` answers that, and the endpoint refuses from the
 * same function — a column would be a second copy of the rule, free to
 * disagree with no test failing.
 */
const NOTICES: Record<Exclude<TranscriptPhase, 'completed'>, Notice> = {
  failed: { title: 'Transcription failed', type: 'error' },
  none: {
    detail: 'One is made automatically when a recording is added.',
    title: 'No transcript yet',
    type: 'default',
  },
  pending: {
    detail: 'Turning the recording into a timestamped transcript.',
    spinner: true,
    title: 'Transcription in progress',
    type: 'default',
  },
  stalled: {
    detail: 'It has not finished, and nothing is still working on it.',
    title: 'Transcription stopped responding',
    type: 'error',
  },
}

/**
 * A recording's transcript as timed paragraphs, read along with `playback` and
 * played from a phrase on click or key. One view for every recording (#1016):
 * a meditation's Transcript tab follows its live preview, and an audio or video
 * file — on its own page, or on a Path Step using it — follows the `player`
 * framed with it.
 */
export function RecordingTranscript({
  transcript,
  playback,
  filename,
  player,
  collapsible = false,
}: {
  transcript: RecordingTranscriptState
  playback: Playback
  /**
   * The recording's stored filename, when the document being edited is not the
   * recording — `RetryTranscript` reads the edited document's otherwise.
   */
  filename?: string | null
  /**
   * The element `playback` follows, when the recording has none of its own on
   * the page. Given one, the player and the transcript share a frame, and the
   * transcript scrolls inside it rather than stretching the form.
   */
  player?: React.ReactNode
  /**
   * Fold the framed player and transcript behind a header, closed, for a
   * transcript that is one part of a longer form rather than the page's point.
   */
  collapsible?: boolean
}) {
  const { error, loaded, phase, recordingId, refresh, relationTo, row, url } = transcript
  // Two memos, not one: `react-hooks/preserve-manual-memoization` refuses a
  // dependency it cannot prove stable, so the cue array needs its own.
  const segments = useMemo(() => row?.segments ?? [], [row])
  const paragraphs = useMemo(() => groupTranscript(segments), [segments])
  const active = activeSegmentIndex(segments, playback.seconds, playback.startOf)
  const container = useRef<HTMLDivElement>(null)
  useFollowPlayhead(container, active, segments.length > 0)

  if (!url) {
    return <InfoBanner type="error">The transcript cannot load without an admin locale.</InfoBanner>
  }
  if (error) {
    return (
      <InfoBanner type="error">
        Could not load the transcript. {error instanceof Error ? error.message : ''}
      </InfoBanner>
    )
  }
  if (!loaded) return <Spinner loadingText="Loading the transcript…" size="sm" />

  const notice = phase === 'completed' ? undefined : NOTICES[phase]
  // The cues decide, never `status`: `deriveTranscriptStatus` answers
  // `completed` from the cues alone, so gating on the string could disagree
  // with what there is to read.
  const body = segments.length > 0 && (
    <div className={player ? styles.scroll : styles.paragraphs} ref={container}>
      {paragraphs.map((paragraph) => (
        <Paragraph
          activeIndex={paragraph.segmentIndexes.includes(active) ? active : -1}
          key={paragraph.segmentIndexes[0]}
          onSeek={playback.playFrom}
          paragraph={paragraph}
          segments={segments}
          startOf={playback.startOf}
        />
      ))}
    </div>
  )

  return (
    <div className={styles.transcript}>
      <div aria-live="polite" className={styles.status} role="status">
        {notice && (
          <InfoBanner
            action={
              transcriptPhaseIsRetryable(phase) &&
              recordingId && (
                <RetryTranscript
                  filename={filename}
                  label={phase === 'none' ? 'Transcribe' : 'Transcribe again'}
                  onRetried={refresh}
                  recordingId={recordingId}
                  relationTo={relationTo}
                  requestedAt={row?.createdAt}
                />
              )
            }
            icon={notice.spinner ? <Spinner loadingText={null} size="sm" /> : undefined}
            title={notice.title}
            type={notice.type}
          >
            {notice.detail ?? row?.error}
          </InfoBanner>
        )}
      </div>
      {!player ? (
        body
      ) : collapsible && segments.length > 0 ? (
        <Collapsible
          className={styles.collapsible}
          header={
            <span>
              Transcript <span className={styles.count}>· {segments.length} lines</span>
            </span>
          }
          initCollapsed
        >
          <div className={styles.player}>{player}</div>
          {body}
        </Collapsible>
      ) : (
        <div className={styles.frame}>
          <div className={styles.player}>{player}</div>
          {body}
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
  startOf,
}: {
  paragraph: TranscriptParagraph
  segments: TranscriptSegment[]
  activeIndex: number
  onSeek: (seconds: number) => void
  startOf: (timeMs: number) => number
}) {
  const label = formatTime(seekSecond(paragraph.startTimeMs))
  return (
    <section className={styles.paragraph}>
      <button
        aria-label={`Play from ${label}`}
        className={styles.timestamp}
        onClick={() => onSeek(startOf(paragraph.startTimeMs))}
        type="button"
      >
        {label}
      </button>
      <p className={styles.text}>
        {paragraph.segmentIndexes.map((index) => {
          const play = () => onSeek(startOf(segments[index].startTimeMs))
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
