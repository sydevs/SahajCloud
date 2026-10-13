'use client'

import { Banner } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { useEffect, useMemo, useRef } from 'react'

import { usePlaybackTime, useSeekToTime } from '@/components/admin/FrameEditor/hooks'
import { formatTime } from '@/components/admin/FrameEditor/utils'

import styles from './MeditationTranscript.module.css'
import {
  frameTitle,
  isApprovedAs,
  type Suggestion,
  suggestionTimestamp,
  useFrameSuggestions,
} from './useFrameSuggestions'

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

/** The last phrase started by `time`. The preview reports whole seconds, so a phrase counts from the second it starts in. */
function lastStarted(segments: Segment[], time: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (Math.floor(segments[index].start) <= time) return index
  }
  return -1
}

/** The phrase playing at `time`, or -1 in a pause. */
function activePhrase(segments: Segment[], time: number): number {
  const index = lastStarted(segments, time)
  return index >= 0 && time < segments[index].end + 0.5 ? index : -1
}

/** A picture change shown in the transcript: a frame of the meditation, or a suggestion still waiting. */
type Mark = {
  key: string
  timestamp: number
  title: string
  kind: 'frame' | 'approved' | 'suggested'
  note?: string
}

/** Each mark after the phrase playing when it starts, or after the last phrase before it in a pause. -1 is before the first phrase. */
function marksByPhrase(segments: Segment[], marks: Mark[]) {
  const byPhrase = new Map<number, Mark[]>()
  for (const mark of [...marks].sort((a, b) => a.timestamp - b.timestamp)) {
    const index = lastStarted(segments, mark.timestamp)
    byPhrase.set(index, [...(byPhrase.get(index) ?? []), mark])
  }
  return byPhrase
}

export function TranscriptView({
  transcript,
  outdated,
  suggestions,
}: {
  transcript: TranscriptFile | null
  outdated: boolean
  suggestions: Suggestion[]
}) {
  const segments = useMemo(() => transcript?.segments ?? [], [transcript])
  const paragraphs = useMemo(() => toParagraphs(segments), [segments])
  const { frames, approved } = useFrameSuggestions(suggestions)
  const byPhrase = useMemo(() => {
    const marks: Mark[] = [
      ...frames.map((frame, index) => ({
        key: `frame-${index}`,
        timestamp: frame.timestamp,
        title: frameTitle(frame),
        kind: suggestions.some((s) => isApprovedAs(s, frame)) ? ('approved' as const) : ('frame' as const),
      })),
      ...suggestions
        .filter((s) => !approved.has(s.id))
        .map((s) => ({
          key: s.id,
          timestamp: suggestionTimestamp(s),
          title: frameTitle(s.frame),
          kind: 'suggested' as const,
          note: `${s.text} — Jev's confidence ${s.confidence.toFixed(2)}`,
        })),
    ]
    return marksByPhrase(segments, marks)
  }, [approved, frames, segments, suggestions])
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
      {suggestions.length > 0 && (
        <Banner type="success">
          {suggestions.length - approved.size} of {suggestions.length} suggested picture changes are
          waiting for review. Dashed marks are suggestions, solid ones are already in the meditation,
          and ✓ marks an approved suggestion. Play the preview and approve each one under the player.
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
            {paragraph.indexes[0] === 0 && <Marks marks={byPhrase.get(-1)} seekTo={seekTo} />}
            {paragraph.indexes.map((index) => {
              const inside = (byPhrase.get(index) ?? []).filter(
                (mark) => mark.timestamp < segments[index].end + 0.5,
              )
              return (
                <React.Fragment key={index}>
                  <span
                    aria-current={index === active ? 'true' : undefined}
                    className={`${styles.phrase} ${styles[strongest(inside)] ?? ''}`}
                    onClick={() =>
                      inside.length ? seekTo(inside[0].timestamp) : play(segments[index].start)
                    }
                  >
                    {segments[index].text}
                  </span>
                  <Marks marks={byPhrase.get(index)} seekTo={seekTo} />{' '}
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
      ))}
    </div>
  )
}

/** The phrase shows the mark that most needs attention: a waiting suggestion first. */
function strongest(marks: Mark[]): string {
  return (['suggested', 'approved', 'frame'] as const).find((kind) => marks.some((m) => m.kind === kind)) ?? ''
}

function Marks({ marks = [], seekTo }: { marks?: Mark[]; seekTo: (seconds: number) => void }) {
  // A Pill is a block, which cannot sit inside running text.
  return marks.map((mark) => (
    <span
      className={`${styles.chip} ${styles[`${mark.kind}Chip`]}`}
      key={mark.key}
      onClick={() => seekTo(mark.timestamp)}
      title={mark.note}
    >
      {mark.kind === 'approved' ? '✓ ' : ''}
      {formatTime(mark.timestamp)} {mark.title}
    </span>
  ))
}
