'use client'

import { Banner } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { useEffect, useMemo, useRef } from 'react'

import { usePlaybackTime, useSeekToTime } from '@/components/admin/FrameEditor/hooks'
import { formatTime } from '@/components/admin/FrameEditor/utils'

import styles from './MeditationTranscript.module.css'

type Segment = { text: string; start: number; end: number }

/** The shape of a file in `seeds/meditation-transcripts/`. */
export type TranscriptFile = { audioFilename: string; segments: Segment[] }

/** A pause this long between phrases starts a new paragraph. */
const PARAGRAPH_GAP_SECONDS = 3

/** A pause this long is marked as a moment of silence. */
const SILENCE_GAP_SECONDS = 10

type Paragraph = { start: number; indexes: number[]; silenceAfter: boolean }

function toParagraphs(segments: Segment[]): Paragraph[] {
  const paragraphs: Paragraph[] = []
  segments.forEach((segment, index) => {
    const gap = index > 0 ? segment.start - segments[index - 1].end : Infinity
    const current = paragraphs.at(-1)
    if (current && gap < PARAGRAPH_GAP_SECONDS) {
      current.indexes.push(index)
      return
    }
    if (current) current.silenceAfter = gap >= SILENCE_GAP_SECONDS
    paragraphs.push({ start: segment.start, indexes: [index], silenceAfter: false })
  })
  return paragraphs
}

/**
 * The phrase playing at `time`, or -1 in a pause. The preview reports whole
 * seconds, so a phrase counts from the second it starts in.
 */
function activePhrase(segments: Segment[], time: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (Math.floor(segments[index].start) <= time) {
      return time < segments[index].end + 0.5 ? index : -1
    }
  }
  return -1
}

export function TranscriptView({
  transcript,
  outdated,
}: {
  transcript: TranscriptFile | null
  outdated: boolean
}) {
  const segments = useMemo(() => transcript?.segments ?? [], [transcript])
  const paragraphs = useMemo(() => toParagraphs(segments), [segments])
  const active = activePhrase(segments, usePlaybackTime())
  const seekTo = useSeekToTime()
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    container.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  if (!transcript) {
    return <Banner type="info">This meditation has no transcript yet.</Banner>
  }

  const play = (seconds: number) => seekTo(Math.floor(seconds))

  return (
    <div className={styles.transcript} ref={container}>
      {outdated && (
        <Banner type="warning">
          The recording has changed since this transcript was made, so it may not match what you
          hear.
        </Banner>
      )}
      {paragraphs.map((paragraph) => (
        <section className={styles.paragraph} key={paragraph.indexes[0]}>
          <button className={styles.timestamp} onClick={() => play(paragraph.start)} type="button">
            {formatTime(Math.floor(paragraph.start))}
          </button>
          {/* A button cannot wrap mid-line like running text, so phrases are
              spans; the timestamp button is the keyboard route to each paragraph. */}
          <p className={styles.text}>
            {paragraph.indexes.map((index) => (
              <React.Fragment key={index}>
                <span
                  aria-current={index === active ? 'true' : undefined}
                  className={styles.phrase}
                  onClick={() => play(segments[index].start)}
                >
                  {segments[index].text}
                </span>{' '}
              </React.Fragment>
            ))}
          </p>
          {paragraph.silenceAfter && (
            <p className={styles.silence}>
              {/* lucide, because Payload's icon set has no sound wave */}
              <AudioLines aria-hidden="true" size={16} strokeWidth={1.5} />A moment of silence
            </p>
          )}
        </section>
      ))}
    </div>
  )
}
