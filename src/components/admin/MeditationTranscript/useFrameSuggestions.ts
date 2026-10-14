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

import {
  approveAllFrames,
  approveFrames,
  pendingSuggestions,
  placeFrame,
  removeFrame,
  type Suggestion,
  suggestionTimestamp,
} from './frames'

export type { Suggestion } from './frames'

/** What editors call a frame: its label, or else its subtle-system node, as the frame inserter shows it. */
export function frameName(frame: Frame | KeyframeData): string {
  return (
    frame.label ||
    getSubtleSystemNodeLabel(getFrameSubtleSystemNodeSlug(frame)) ||
    getFrameDisplayLabel(frame)
  )
}

/** A frame's tags, which tell apart frames sharing a name (left or right, still or bandhan). */
export const frameDetails = (frame: Frame | KeyframeData) => frame.tags?.join(', ') || undefined

/** Name and tags in one line, for toasts. */
export const frameTitle = (frame: Frame | KeyframeData) =>
  [frameName(frame), frameDetails(frame)].filter(Boolean).join(' · ')

/**
 * The meditation's frames and the suggestions still waiting, with the edits the Transcript tab
 * offers. Every edit is the same unsaved change to the `frames` field that the frame inserter
 * makes, kept by Save Draft; the live preview shows it at once.
 */
export function useFrameSuggestions(suggestions: Suggestion[]) {
  const { value, setValue: setFrames } = useField<KeyframeData[]>({ path: 'frames' })
  const frames = useMemo(() => value ?? [], [value])
  // ⚠ Prototype: a suggestion set aside comes back on reload. Where that is remembered is left to the implementation.
  const [setAside, setSetAside] = useState<ReadonlySet<string>>(new Set())
  const pending = useMemo(
    () => pendingSuggestions(suggestions, frames, setAside),
    [frames, setAside, suggestions],
  )

  const approve = useCallback(
    (suggestion: Suggestion, frame: Frame = suggestion.frame) => {
      setFrames(approveFrames(frames, suggestion, frame))
      toast.success(
        `Added ${frameTitle(frame)} at ${formatTime(suggestionTimestamp(suggestion))}. Save the draft to keep it.`,
      )
    },
    [frames, setFrames],
  )

  const approveAll = useCallback(() => {
    setFrames(approveAllFrames(frames, pending))
    toast.success(
      `Added ${pending.length} suggested ${pending.length === 1 ? 'frame' : 'frames'}. Save the draft to keep them.`,
    )
  }, [frames, pending, setFrames])

  const setSuggestionAside = useCallback((suggestion: Suggestion) => {
    setSetAside((previous) => new Set(previous).add(suggestion.id))
  }, [])

  const change = useCallback(
    (timestamp: number, frame: Frame) => {
      setFrames(placeFrame(frames, frame, timestamp))
      toast.success(
        `Changed the frame at ${formatTime(timestamp)} to ${frameTitle(frame)}. Save the draft to keep it.`,
      )
    },
    [frames, setFrames],
  )

  const remove = useCallback(
    (timestamp: number) => {
      setFrames(removeFrame(frames, timestamp))
      toast.success(`Removed the frame at ${formatTime(timestamp)}. Save the draft to keep it.`)
    },
    [frames, setFrames],
  )

  return { frames, pending, approve, approveAll, setSuggestionAside, change, remove }
}
