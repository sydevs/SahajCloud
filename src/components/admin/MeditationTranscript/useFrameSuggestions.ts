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
  approveFrames,
  pendingSuggestions,
  placeFrame,
  removeFrame,
  type Suggestion,
  suggestionTimestamp,
} from './frames'

export type { Suggestion } from './frames'

/** What an editor recognises a frame by, as the frame inserter shows it: its chakra and its tags. */
export function frameTitle(frame: Frame | KeyframeData): string {
  const node = getSubtleSystemNodeLabel(getFrameSubtleSystemNodeSlug(frame))
  const parts = [frame.label || node, frame.tags?.join(', ')].filter(Boolean)
  return parts.length ? parts.join(' · ') : getFrameDisplayLabel(frame)
}

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

  return { frames, pending, approve, setSuggestionAside, change, remove }
}
