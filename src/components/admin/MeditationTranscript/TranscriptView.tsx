'use client'

import type { Suggestion } from './frames'

import { Banner, Button, Pill, useListDrawer } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { usePlaybackTime, useSeekToTime } from '@/components/admin/FrameEditor/hooks'
import type { Frame } from '@/payload-types'

import { FrameCard } from './FrameCard'
import styles from './MeditationTranscript.module.css'
import { activePhrase, buildRows, clock, cueParts, foldFarLines, type Segment } from './rows'
import { frameTitle, useFrameSuggestions } from './useFrameSuggestions'

/** The shape of a file in `seeds/meditation-transcripts/`. */
export type TranscriptFile = { audioFilename: string; segments: Segment[] }

export function TranscriptView({
  transcript,
  outdated,
  suggestions,
  imageSet,
}: {
  transcript: TranscriptFile | null
  outdated: boolean
  suggestions: Suggestion[]
  /** The narrator's gender: picking another frame offers only the matching set. */
  imageSet?: string | null
}) {
  const segments = useMemo(() => transcript?.segments ?? [], [transcript])
  const { frames, pending, approve, setSuggestionAside, change, remove } =
    useFrameSuggestions(suggestions)
  const active = activePhrase(segments, usePlaybackTime())
  const seekTo = useSeekToTime()
  const container = useRef<HTMLDivElement>(null)
  const [nearOnly, setNearOnly] = useState(false)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())

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
  const pick = (timestamp: number, suggestion?: Suggestion) => {
    setTarget({ timestamp, suggestion })
    openDrawer()
  }

  const rows = useMemo(
    () => buildRows(segments, frames, pending, suggestions),
    [frames, pending, segments, suggestions],
  )
  const shown = useMemo(
    () => (nearOnly ? foldFarLines(rows, segments, opened) : rows),
    [nearOnly, opened, rows, segments],
  )

  useEffect(() => {
    container.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  /** Scrolls to the next waiting suggestion below the top of the view, wrapping to the first. */
  const nextSuggestion = () => {
    const cards = [
      ...(container.current?.querySelectorAll<HTMLElement>('[data-status="suggested"]') ?? []),
    ]
    const next = cards.find((card) => card.getBoundingClientRect().top > 120) ?? cards[0]
    next?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  if (!transcript) return <Banner type="info">This meditation has no transcript yet.</Banner>

  return (
    <div className={styles.transcript} ref={container}>
      {outdated && (
        <Banner type="warning">
          The recording has changed since this transcript was made, so it may not match what you
          hear.
        </Banner>
      )}
      <div className={styles.toolbar}>
        {pending.length > 0 ? (
          <>
            <Pill pillStyle="warning" size="small">
              {pending.length} suggested
            </Pill>
            <span className={styles.toolbarNote}>Review each where it sits in the narration.</span>
            <Button
              buttonStyle="secondary"
              icon={['chevron']}
              iconPosition="right"
              margin={false}
              onClick={nextSuggestion}
              size="small"
            >
              Next suggestion
            </Button>
          </>
        ) : (
          <span className={styles.toolbarNote}>
            {suggestions.length
              ? 'Every suggestion has been reviewed.'
              : 'Click a line to play from it.'}
          </span>
        )}
        <Button
          buttonStyle="subtle"
          className={styles.toolbarEnd}
          margin={false}
          onClick={() => setNearOnly(!nearOnly)}
          size="small"
        >
          {nearOnly ? 'Show all lines' : 'Only lines near frames'}
        </Button>
      </div>

      <div className={styles.rows}>
        {shown.map((row) => {
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
                  {clock(segment.start, true)}
                </button>
                {/* The time is the keyboard route; the text is a larger click target for the same seek. */}
                <p className={styles.say} onClick={() => seekTo(Math.floor(segment.start))}>
                  {cueParts(segment.text).map((part, index) =>
                    part.cue ? (
                      <strong className={styles.cue} key={index}>
                        {part.text}
                      </strong>
                    ) : (
                      part.text
                    ),
                  )}
                </p>
              </div>
            )
          }
          if (row.type === 'gap') {
            return (
              <button
                className={styles.gap}
                key={row.key}
                onClick={() => setOpened(new Set(opened).add(row.key))}
                type="button"
              >
                {row.count} {row.count === 1 ? 'line' : 'lines'} · {clock(row.time)}–{clock(row.to)}
              </button>
            )
          }
          if (row.type === 'silence') {
            return (
              <p className={styles.silence} key={row.key}>
                {/* lucide, because Payload's icon set has no sound wave */}
                <AudioLines aria-hidden="true" size={14} strokeWidth={1.5} />
                {row.seconds} s of silence
              </p>
            )
          }
          const replaced =
            row.status === 'suggested' && row.suggestion?.replaces
              ? frames.find((f) => f.timestamp === row.suggestion?.replaces?.timestamp)
              : undefined
          return (
            <div className={styles.frameRow} key={row.key}>
              <FrameCard
                frame={row.frame}
                onApprove={() => row.suggestion && approve(row.suggestion)}
                onChange={() =>
                  pick(row.time, row.status === 'suggested' ? row.suggestion : undefined)
                }
                onRemove={() => remove(row.time)}
                onSeek={() => seekTo(row.time)}
                onSetAside={() => row.suggestion && setSuggestionAside(row.suggestion)}
                reason={row.suggestion?.reason}
                replaces={replaced && { title: frameTitle(replaced), time: replaced.timestamp }}
                status={row.status}
                time={row.time}
                title={frameTitle(row.frame)}
              />
            </div>
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
