'use client'

import { toast, useField } from '@payloadcms/ui'
import { useCallback, useMemo, useState } from 'react'

import {
  formatTime,
  getFrameDisplayLabel,
  getFrameSubtleSystemNodeSlug,
  getSubtleSystemNodeLabel,
} from '@/components/admin/FrameEditor/utils'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

/** A suggested frame change, from a file in `seeds/frame-suggestions/`, with its frame loaded. */
export type Suggestion = {
  id: string
  /** Seconds into the recording where the instruction starts. */
  start: number
  text: string
  frameId: number
  /** position, movement, return or unsure: how the suggestion reads the instruction. */
  kind?: string
  /** One sentence on why this picture, shown to the editor. */
  reason?: string
  /** An editor frame this suggestion disagrees with, which approving replaces. */
  replaces?: { timestamp: number; frameId: number }
  frame: Frame
}

export const suggestionTimestamp = (suggestion: Suggestion) => Math.round(suggestion.start)

/**
 * A suggestion is handled once the meditation has a frame at its time: its own frame (approved)
 * or the one an editor picked with Change. Derived from the frames, so a reload keeps it.
 */
export const isHandledBy = (suggestion: Suggestion, frame: KeyframeData) =>
  frame.timestamp === suggestionTimestamp(suggestion)

export const isApprovedAs = (suggestion: Suggestion, frame: KeyframeData) =>
  isHandledBy(suggestion, frame) && String(frame.id) === String(suggestion.frameId)

/** What an editor recognises a frame by, as the frame inserter shows it: its chakra and its tags. */
export function frameTitle(frame: Frame | KeyframeData): string {
  const node = getSubtleSystemNodeLabel(getFrameSubtleSystemNodeSlug(frame))
  const parts = [frame.label || node, frame.tags?.join(', ')].filter(Boolean)
  return parts.length ? parts.join(' · ') : getFrameDisplayLabel(frame)
}

const byTime = (a: KeyframeData, b: KeyframeData) => a.timestamp - b.timestamp

/**
 * The meditation's frames and the suggestions still waiting, with the edits the Transcript tab
 * offers. Every edit is the same unsaved change to the `frames` field that the frame inserter
 * makes, kept by Save Draft; the preview shows it at once.
 */
export function useFrameSuggestions(suggestions: Suggestion[]) {
  const { value, setValue: setFrames } = useField<KeyframeData[]>({ path: 'frames' })
  const frames = useMemo(() => value ?? [], [value])
  // ⚠ Prototype: "Keep current" lasts until reload. Where it is remembered is the pipeline's call.
  const [kept, setKept] = useState<Set<string>>(new Set())

  const approved = useMemo(
    () =>
      new Set(suggestions.filter((s) => frames.some((f) => isHandledBy(s, f))).map((s) => s.id)),
    [frames, suggestions],
  )
  const pending = useMemo(
    () => suggestions.filter((s) => !approved.has(s.id) && !kept.has(s.id)),
    [approved, kept, suggestions],
  )

  /** Put `frame` at `timestamp`, dropping whatever was at that second and at `alsoDrop`. */
  const place = useCallback(
    (frame: Frame | KeyframeData, timestamp: number, alsoDrop?: number) => {
      setFrames(
        [
          ...frames.filter((f) => f.timestamp !== timestamp && f.timestamp !== alsoDrop),
          { ...frame, timestamp } as KeyframeData,
        ].sort(byTime),
      )
    },
    [frames, setFrames],
  )

  const approve = useCallback(
    (suggestion: Suggestion, frame: Frame = suggestion.frame) => {
      const timestamp = suggestionTimestamp(suggestion)
      place(frame, timestamp, suggestion.replaces?.timestamp)
      toast.success(
        `Added ${frameTitle(frame)} at ${formatTime(timestamp)}. Save the draft to keep it.`,
      )
    },
    [place],
  )

  const keepCurrent = useCallback((suggestion: Suggestion) => {
    setKept((previous) => new Set(previous).add(suggestion.id))
  }, [])

  const change = useCallback(
    (timestamp: number, frame: Frame) => {
      place(frame, timestamp)
      toast.success(
        `Changed the frame at ${formatTime(timestamp)} to ${frameTitle(frame)}. Save the draft to keep it.`,
      )
    },
    [place],
  )

  const remove = useCallback(
    (timestamp: number) => {
      setFrames(frames.filter((f) => f.timestamp !== timestamp))
      toast.success(`Removed the frame at ${formatTime(timestamp)}. Save the draft to keep it.`)
    },
    [frames, setFrames],
  )

  return { frames, approved, pending, approve, keepCurrent, change, remove }
}
