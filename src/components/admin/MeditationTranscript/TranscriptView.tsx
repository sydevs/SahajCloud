'use client'

import { Banner, Button, Pill, useListDrawer } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { FrameThumbnail } from '@/components/admin/FrameEditor/FrameThumbnail'
import { usePlaybackTime, useSeekToTime } from '@/components/admin/FrameEditor/hooks'
import { formatTime } from '@/components/admin/FrameEditor/utils'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

import styles from './MeditationTranscript.module.css'
import {
  frameTitle,
  isApprovedAs,
  isHandledBy,
  type Suggestion,
  suggestionTimestamp,
  useFrameSuggestions,
} from './useFrameSuggestions'

type Segment = { text: string; start: number; end: number }

/** The shape of a file in `seeds/meditation-transcripts/`. */
export type TranscriptFile = { audioFilename: string; segments: Segment[] }

/** A pause this long is marked as a moment of silence. */
const SILENCE_GAP_SECONDS = 10

/** In the cue view, lines this close to a frame stay visible: the lead-up to it, and just after. */
const CUE_BEFORE_SECONDS = 12
const CUE_AFTER_SECONDS = 4

/** Words that usually start a hand instruction, highlighted so the eye finds them. */
const HAND_CUE =
  /\b(place|put|bring|raise|lift|lower|press|massage|rotate|rub|give|hold|rest|touch|keep|move|take|tap|sweep)\b/gi

type FrameRow = {
  type: 'frame'
  key: string
  time: number
  status: 'frame' | 'approved' | 'changed' | 'suggested'
  frame: Frame | KeyframeData
  suggestion?: Suggestion
}
type Row =
  | { type: 'line'; key: string; time: number; index: number }
  | { type: 'gap'; key: string; time: number; to: number; count: number }
  | { type: 'silence'; key: string; time: number; seconds: number }
  | FrameRow

/** Tenths show which of two close lines a frame follows. */
const lineTime = (seconds: number) =>
  `${formatTime(Math.floor(seconds))}.${Math.floor((seconds % 1) * 10)}`

function highlight(text: string): React.ReactNode[] {
  return text.split(HAND_CUE).map((part, index) =>
    index % 2 ? (
      <mark className={styles.cue} key={index}>
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/** The phrase playing at `time`, or -1 in a pause. The preview reports whole seconds. */
function activePhrase(segments: Segment[], time: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (Math.floor(segments[index].start) <= time)
      return time < segments[index].end + 0.5 ? index : -1
  }
  return -1
}

export function TranscriptView({
  transcript,
  outdated,
  suggestions,
  imageSet,
}: {
  transcript: TranscriptFile | null
  outdated: boolean
  suggestions: Suggestion[]
  /** The narrator's gender: Change offers only frames from the matching set. */
  imageSet?: string | null
}) {
  const segments = useMemo(() => transcript?.segments ?? [], [transcript])
  const { frames, pending, approve, keepCurrent, change, remove } = useFrameSuggestions(suggestions)
  const active = activePhrase(segments, usePlaybackTime())
  const seekTo = useSeekToTime()
  const container = useRef<HTMLDivElement>(null)
  // The cue view shows only the narration around frames and hand cues; the rest folds into gaps.
  const [whole, setWhole] = useState(false)
  const [opened, setOpened] = useState<Set<string>>(new Set())

  const [target, setTarget] = useState<{ timestamp: number; suggestion?: Suggestion } | null>(null)
  // A new filter object on every render makes the drawer re-fetch its list in a loop.
  const filterOptions = useMemo(
    () => (imageSet ? { frames: { imageSet: { equals: imageSet } } } : undefined),
    [imageSet],
  )
  const [FramesDrawer, , { openDrawer, closeDrawer }] = useListDrawer({
    collectionSlugs: ['frames'],
    filterOptions,
  })
  const openChange = (timestamp: number, suggestion?: Suggestion) => {
    setTarget({ timestamp, suggestion })
    openDrawer()
  }

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = segments.map((segment, index) => ({
      type: 'line',
      key: `line-${index}`,
      time: segment.start,
      index,
    }))
    segments.forEach((segment, index) => {
      const gap = index > 0 ? segment.start - segments[index - 1].end : 0
      if (gap >= SILENCE_GAP_SECONDS)
        list.push({
          type: 'silence',
          key: `silence-${index}`,
          time: segments[index - 1].end,
          seconds: Math.round(gap),
        })
    })
    frames.forEach((frame) => {
      const suggestion = suggestions.find((s) => isHandledBy(s, frame))
      list.push({
        type: 'frame',
        key: `frame-${frame.timestamp}`,
        time: frame.timestamp,
        status: !suggestion ? 'frame' : isApprovedAs(suggestion, frame) ? 'approved' : 'changed',
        frame,
        suggestion,
      })
    })
    pending.forEach((suggestion) =>
      list.push({
        type: 'frame',
        key: suggestion.id,
        time: suggestionTimestamp(suggestion),
        status: 'suggested',
        frame: suggestion.frame,
        suggestion,
      }),
    )
    return list.sort((a, b) => a.time - b.time)
  }, [frames, pending, segments, suggestions])

  const shown = useMemo<Row[]>(() => {
    if (whole) return rows
    const frameTimes = rows.flatMap((row) => (row.type === 'frame' ? [row.time] : []))
    const isCue = (index: number) => {
      const { start, end, text } = segments[index]
      return (
        new RegExp(HAND_CUE.source, 'i').test(text) ||
        frameTimes.some(
          (t) =>
            (start >= t - CUE_BEFORE_SECONDS && start <= t + CUE_AFTER_SECONDS) ||
            (start <= t && end >= t),
        )
      )
    }
    const out: Row[] = []
    let hidden: Extract<Row, { type: 'line' }>[] = []
    const flush = () => {
      if (!hidden.length) return
      const key = `gap-${hidden[0].index}`
      if (opened.has(key)) out.push(...hidden)
      else
        out.push({
          type: 'gap',
          key,
          time: hidden[0].time,
          to: segments[hidden.at(-1)!.index].end,
          count: hidden.length,
        })
      hidden = []
    }
    for (const row of rows) {
      if (row.type === 'silence') continue
      if (row.type === 'line' && !isCue(row.index)) {
        hidden.push(row)
        continue
      }
      flush()
      out.push(row)
    }
    flush()
    return out
  }, [opened, rows, segments, whole])

  useEffect(() => {
    container.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  if (!transcript) return <Banner type="info">This meditation has no transcript yet.</Banner>

  return (
    <div className={styles.transcript} ref={container}>
      {outdated && (
        <Banner type="warning">
          The recording has changed since this transcript was made, so it may not match what you
          hear.
        </Banner>
      )}
      {pending.length > 0 && (
        <Banner type="info">
          {pending.length} suggested {pending.length === 1 ? 'frame is' : 'frames are'} waiting.
          Approve each one where it sits in the narration, or change it to another frame. The
          preview shows a frame as soon as it is approved.
        </Banner>
      )}
      <div className={styles.viewBar}>
        <span className={styles.viewNote}>
          {whole
            ? 'The whole transcript.'
            : 'Only the narration around frames and hand cues. Folded lines open with a click.'}
        </span>
        <Button
          buttonStyle="secondary"
          margin={false}
          onClick={() => setWhole(!whole)}
          size="small"
        >
          {whole ? 'Show frame cues only' : 'Show the whole transcript'}
        </Button>
      </div>
      <div className={styles.rows}>
        {shown.map((row) => {
          if (row.type === 'gap') {
            return (
              <button
                className={styles.gap}
                key={row.key}
                onClick={() => setOpened(new Set(opened).add(row.key))}
                type="button"
              >
                ⋯ {row.count} {row.count === 1 ? 'line' : 'lines'} ·{' '}
                {formatTime(Math.floor(row.time))}–{formatTime(Math.floor(row.to))}
              </button>
            )
          }
          if (row.type === 'line') {
            const segment = segments[row.index]
            return (
              <div
                aria-current={row.index === active ? 'true' : undefined}
                className={styles.line}
                key={row.key}
              >
                <button
                  className={styles.time}
                  onClick={() => seekTo(Math.floor(segment.start))}
                  type="button"
                >
                  {lineTime(segment.start)}
                </button>
                {/* The time is the keyboard route; the text is a larger click target for the same seek. */}
                <p className={styles.say} onClick={() => seekTo(Math.floor(segment.start))}>
                  {highlight(segment.text)}
                </p>
              </div>
            )
          }
          if (row.type === 'silence') {
            return (
              <p className={styles.silence} key={row.key}>
                {/* lucide, because Payload's icon set has no sound wave */}
                <AudioLines aria-hidden="true" size={16} strokeWidth={1.5} />
                {row.seconds} s of silence
              </p>
            )
          }
          return (
            <FrameRowView
              key={row.key}
              onApprove={() => row.suggestion && approve(row.suggestion)}
              onChange={() =>
                openChange(row.time, row.status === 'suggested' ? row.suggestion : undefined)
              }
              onKeep={() => row.suggestion && keepCurrent(row.suggestion)}
              onRemove={() => remove(row.time)}
              onSeek={() => seekTo(row.time)}
              replaced={
                row.suggestion?.replaces &&
                frames.find((f) => f.timestamp === row.suggestion?.replaces?.timestamp)
              }
              row={row}
            />
          )
        })}
      </div>
      <FramesDrawer
        onSelect={({ doc }) => {
          if (target?.suggestion) approve(target.suggestion, doc as Frame)
          else if (target) change(target.timestamp, doc as Frame)
          setTarget(null)
          closeDrawer()
        }}
      />
    </div>
  )
}

const STATUS = {
  frame: { label: 'In the meditation', pill: 'light-gray' },
  approved: { label: 'Approved suggestion', pill: 'success' },
  changed: { label: 'Changed from suggestion', pill: 'success' },
  suggested: { label: 'Suggested', pill: 'warning' },
} as const

function FrameRowView({
  row,
  replaced,
  onSeek,
  onApprove,
  onChange,
  onKeep,
  onRemove,
}: {
  row: FrameRow
  replaced?: KeyframeData
  onSeek: () => void
  onApprove: () => void
  onChange: () => void
  onKeep: () => void
  onRemove: () => void
}) {
  const { label, pill } = STATUS[row.status]
  const suggested = row.status === 'suggested'
  return (
    <div className={`${styles.frameRow} ${styles[row.status]}`}>
      <button className={styles.time} onClick={onSeek} type="button">
        {formatTime(row.time)}
      </button>
      <div className={styles.frameBody}>
        <span className={styles.thumb}>
          <FrameThumbnail
            frame={row.frame}
            style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 4 }}
          />
        </span>
        <div className={styles.frameText}>
          <Pill pillStyle={pill} size="small">
            {label}
          </Pill>
          <span className={styles.frameTitle}>{frameTitle(row.frame)}</span>
          {row.suggestion?.reason && <span className={styles.reason}>{row.suggestion.reason}</span>}
          {suggested && replaced && (
            <span className={styles.reason}>
              Instead of {frameTitle(replaced)} at {formatTime(replaced.timestamp)}
            </span>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        {suggested ? (
          <>
            <Button buttonStyle="primary" margin={false} onClick={onApprove} size="small">
              Approve
            </Button>
            <Button buttonStyle="secondary" margin={false} onClick={onChange} size="small">
              Change
            </Button>
            <Button buttonStyle="subtle" margin={false} onClick={onKeep} size="small">
              {replaced ? 'Keep current' : 'Not needed'}
            </Button>
          </>
        ) : (
          <>
            <Button buttonStyle="secondary" margin={false} onClick={onChange} size="small">
              Change
            </Button>
            <Button buttonStyle="subtle" margin={false} onClick={onRemove} size="small">
              Remove
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
