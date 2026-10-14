'use client'

import { Banner, Button, useListDrawer } from '@payloadcms/ui'
import { AudioLines } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'

import { usePlaybackTime, useSeekToTime } from '@/components/admin/FrameEditor/hooks'
import type { Frame } from '@/payload-types'

import { FrameCard } from './FrameCard'
import { type Suggestion, suggestionTimestamp } from './frames'
import styles from './MeditationTranscript.module.css'
import {
  activePhrase,
  buildBlocks,
  clock,
  frameBlocks,
  markRuns,
  nextBelow,
  quotedRanges,
  type Segment,
} from './rows'
import { frameDetails, frameName, useFrameSuggestions } from './useFrameSuggestions'

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
  const { frames, pending, approve, approveAll, setSuggestionAside, change, remove } =
    useFrameSuggestions(suggestions)
  const active = activePhrase(segments, usePlaybackTime())
  const seekTo = useSeekToTime()
  const container = useRef<HTMLDivElement>(null)

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

  const blocks = useMemo(
    () => buildBlocks(segments, frameBlocks(frames, pending, suggestions)),
    [frames, pending, segments, suggestions],
  )
  // Every suggestion behind a frame or still waiting; one set aside put nothing in, so shows nothing.
  const quoted = useMemo(
    () =>
      quotedRanges(
        segments,
        blocks.flatMap((block) =>
          block.type === 'frame' && block.suggestion
            ? [
                {
                  ...block.suggestion,
                  kind: block.status === 'suggested' ? ('waiting' as const) : ('added' as const),
                },
              ]
            : [],
        ),
      ),
    [blocks, segments],
  )

  useEffect(() => {
    container.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  const suggestionCards = () => [
    ...(container.current?.querySelectorAll<HTMLElement>('[data-status="suggested"]') ?? []),
  ]

  // How many waiting suggestions are on screen: with none, the review button floats in.
  const [onScreen, setOnScreen] = useState(0)
  useEffect(() => {
    const visible = new Set<Element>()
    setOnScreen(0)
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target)
        else visible.delete(entry.target)
      }
      setOnScreen(visible.size)
    })
    suggestionCards().forEach((card) => observer.observe(card))
    return () => observer.disconnect()
  }, [blocks])

  /** Scrolls to the next waiting suggestion below the top of the view, wrapping to the first. */
  const reviewNext = () => {
    const cards = suggestionCards()
    const tops = cards.map((card) => card.getBoundingClientRect().top)
    cards[nextBelow(tops, 120)]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  if (!transcript) return <Banner type="info">This meditation has no transcript yet.</Banner>

  const play = (seconds: number) => seekTo(Math.floor(seconds))

  return (
    <div className={styles.transcript} ref={container}>
      {outdated && (
        <Banner type="warning">
          The recording has changed since this transcript was made, so it may not match what you
          hear.
        </Banner>
      )}
      {pending.length > 0 && (
        <div className={styles.summary}>
          <span>
            {pending.length} suggested {pending.length === 1 ? 'frame' : 'frames'} to review
          </span>
          <Button buttonStyle="secondary" margin={false} onClick={approveAll} size="small">
            Approve all
          </Button>
        </div>
      )}

      {blocks.map((block) => {
        if (block.type === 'paragraph') {
          return (
            <section className={styles.paragraph} key={block.key}>
              <button className={styles.timestamp} onClick={() => play(block.start)} type="button">
                {clock(block.start)}
              </button>
              {/* A button cannot wrap mid-line like running text, so phrases are
                  spans; the timestamp button is the keyboard route to each paragraph. */}
              <p className={styles.text}>
                {block.indexes.map((index) => (
                  <React.Fragment key={index}>
                    <span
                      aria-current={index === active ? 'true' : undefined}
                      className={styles.phrase}
                      onClick={() => play(segments[index].start)}
                    >
                      {markRuns(segments[index].text, quoted.get(index)).map((run, i) =>
                        run.kind ? (
                          <mark className={styles.quoted} data-kind={run.kind} key={i}>
                            {run.text}
                          </mark>
                        ) : (
                          run.text
                        ),
                      )}
                    </span>{' '}
                  </React.Fragment>
                ))}
              </p>
            </section>
          )
        }
        if (block.type === 'silence') {
          return (
            <p className={styles.silence} key={block.key}>
              {/* lucide, because Payload's icon set has no sound wave */}
              <AudioLines aria-hidden="true" size={16} strokeWidth={1.5} />A moment of silence
            </p>
          )
        }
        const replaced =
          block.status === 'suggested' && block.suggestion?.replaces
            ? frames.find((f) => f.timestamp === block.suggestion?.replaces?.timestamp)
            : undefined
        const replacer =
          block.status === 'suggested'
            ? undefined
            : pending.find((s) => s.replaces?.timestamp === block.time)
        return (
          <FrameCard
            details={frameDetails(block.frame)}
            frame={block.frame}
            key={block.key}
            name={frameName(block.frame)}
            onApprove={() => block.suggestion && approve(block.suggestion)}
            onChange={() =>
              pick(block.time, block.status === 'suggested' ? block.suggestion : undefined)
            }
            onRemove={() => remove(block.time)}
            onSeek={() => seekTo(block.time)}
            onSetAside={() => block.suggestion && setSuggestionAside(block.suggestion)}
            reason={block.suggestion?.reason}
            replacedBy={
              replacer && {
                name: frameName(replacer.frame),
                time: suggestionTimestamp(replacer),
                frame: replacer.frame,
              }
            }
            replaces={
              replaced && { name: frameName(replaced), time: replaced.timestamp, frame: replaced }
            }
            status={block.status}
            time={block.time}
          />
        )
      })}
      {pending.length > 0 && onScreen === 0 && (
        <div className={styles.reviewNext}>
          <Button buttonStyle="primary" margin={false} onClick={reviewNext} size="small">
            Review next frame · {pending.length} left
          </Button>
        </div>
      )}
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
