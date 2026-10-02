'use client'

import type { UIFieldClientComponent } from 'payload'

import { Banner, Button, Spinner, useDocumentInfo, useLocale } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { memo, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

import { usePlaybackTime, useSeekToTime } from '@/components/admin/FrameEditor/hooks'
import { formatTime } from '@/components/admin/FrameEditor/utils'
import type { TranscriptSegment, TranscriptView } from '@/lib/meditations/transcript'

import styles from './MeditationTranscript.module.css'
import {
  activeSegmentIndex,
  activeWordIndex,
  alignWords,
  groupTranscript,
  type TranscriptParagraph,
  transcriptPhase,
  transcriptUrl,
} from './transcriptModel'
import { useFollowPlayhead } from './useFollowPlayhead'
import { useSmoothPlaybackTime } from './useSmoothPlaybackTime'

const POLL_INTERVAL_MS = 3000

async function readTranscript(url: string, init?: RequestInit): Promise<TranscriptView> {
  const response = await fetch(url, { credentials: 'include', ...init })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { errors?: { message?: string }[] } | null)?.errors?.[0]?.message
    throw new Error(message ?? `The server answered ${response.status}.`)
  }
  return body as TranscriptView
}

/** The preview seeks in whole seconds, so a phrase plays from just before it starts. */
const seekSecond = (seconds: number): number => Math.floor(seconds)

/**
 * The meditation's Transcript tab: transcribe the recording, follow it as the
 * live preview plays, and click a phrase to play from there.
 */
export const MeditationTranscript: UIFieldClientComponent = () => {
  const { id, docPermissions } = useDocumentInfo()
  const { code } = useLocale()
  const url = transcriptUrl(id, code)

  const { data, error, mutate } = useSWR(url, readTranscript, {
    refreshInterval: (latest) =>
      latest && transcriptPhase(latest) === 'pending' ? POLL_INTERVAL_MS : 0,
    revalidateOnFocus: false,
  })
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const playbackTime = useSmoothPlaybackTime(usePlaybackTime())
  const seekTo = useSeekToTime()
  const segments = useMemo(() => data?.segments ?? [], [data])
  const paragraphs = useMemo(() => groupTranscript(segments), [segments])
  const active = activeSegmentIndex(segments, playbackTime)
  const activeWord = active >= 0 ? activeWordIndex(segments[active].words, playbackTime) : -1
  const container = useRef<HTMLDivElement>(null)
  useFollowPlayhead(container, active)

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

  const phase = transcriptPhase(data)
  const canRequest = Boolean(docPermissions?.update)

  const request = async () => {
    setRequesting(true)
    setRequestError(null)
    try {
      // Revalidating, not just caching, is what restarts polling: SWR re-arms
      // `refreshInterval` only after a fetch, and the last one saw no request.
      await mutate(await readTranscript(url, { method: 'POST' }))
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRequesting(false)
    }
  }

  const requestButton = (label: string) =>
    canRequest ? (
      <Button buttonStyle="secondary" disabled={requesting} margin={false} onClick={request}>
        {label}
      </Button>
    ) : null

  return (
    <div className={styles.transcript}>
      <div aria-live="polite" className={styles.status} role="status">
        {phase === 'none' && (
          <>
            <p className={styles.muted}>
              No transcript yet. Transcribe the recording to read along with it and jump to any
              phrase.
            </p>
            {requestButton('Transcribe recording')}
          </>
        )}
        {phase === 'pending' && (
          <div className={styles.progress}>
            <Spinner loadingText={null} size="sm" />
            <div>
              <strong>Transcription in progress</strong>
              <p className={styles.muted}>
                {data.status === 'queued'
                  ? 'Waiting to start.'
                  : 'Turning the recording into a timestamped transcript.'}
              </p>
            </div>
          </div>
        )}
        {phase === 'failed' && (
          <Banner type="error">
            <strong>Transcription failed.</strong> {data.error}
          </Banner>
        )}
        {phase === 'stalled' && (
          <Banner type="error">
            <strong>Transcription stopped responding.</strong> It has not finished in 15 minutes.
          </Banner>
        )}
        {(phase === 'failed' || phase === 'stalled') && requestButton('Try again')}
        {phase === 'outdated' && (
          <>
            <Banner type="warning">
              The recording has changed since this transcript was requested.
            </Banner>
            {requestButton('Transcribe again')}
          </>
        )}
      </div>
      {requestError && <Banner type="error">{requestError}</Banner>}
      {data.status === 'completed' && data.provider === 'sample' && (
        <Banner type="info">
          Sample transcript. Lemonfox is not configured here, so this placeholder text does not come
          from the recording.
        </Banner>
      )}
      {data.status === 'completed' && (
        <div className={styles.paragraphs} ref={container}>
          {paragraphs.map((paragraph) => {
            const holdsActive = paragraph.segmentIndexes.includes(active)
            return (
              <Paragraph
                activeIndex={holdsActive ? active : -1}
                activeWord={holdsActive ? activeWord : -1}
                key={paragraph.segmentIndexes[0]}
                onSeek={seekTo}
                paragraph={paragraph}
                segments={segments}
              />
            )
          })}
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
  activeWord,
  onSeek,
}: {
  paragraph: TranscriptParagraph
  segments: TranscriptSegment[]
  activeIndex: number
  activeWord: number
  onSeek: (seconds: number) => void
}) {
  const start = seekSecond(paragraph.start)
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
        {paragraph.segmentIndexes.map((index) => (
          <React.Fragment key={index}>
            <button
              aria-current={index === activeIndex ? 'true' : undefined}
              className={styles.phrase}
              onClick={() => onSeek(seekSecond(segments[index].start))}
              type="button"
            >
              {index === activeIndex ? (
                <SpokenPhrase segment={segments[index]} activeWord={activeWord} />
              ) : (
                segments[index].text
              )}
            </button>{' '}
          </React.Fragment>
        ))}
      </p>
      {paragraph.silenceAfter && (
        <p className={styles.silence}>
          <AudioLines aria-hidden="true" size={16} strokeWidth={1.5} />A moment of silence
        </p>
      )}
    </section>
  )
})

/** The playing phrase, word by word, with the word being spoken marked. */
function SpokenPhrase({ segment, activeWord }: { segment: TranscriptSegment; activeWord: number }) {
  const tokens = useMemo(() => alignWords(segment.text, segment.words), [segment])
  return tokens.map((token, index) => (
    <React.Fragment key={index}>
      {index > 0 && ' '}
      <span className={token.wordIndex === activeWord ? styles.spokenWord : undefined}>
        {token.text}
      </span>
    </React.Fragment>
  ))
}

export default MeditationTranscript
