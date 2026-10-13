'use client'

import { toast, useField, useLivePreviewContext } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo } from 'react'

import {
  formatTime,
  getFrameDisplayLabel,
  getFrameSubtleSystemNodeSlug,
  getSubtleSystemNodeLabel,
} from '@/components/admin/FrameEditor/utils'
import { originOf } from '@/lib/utilities/url'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

/** A suggested frame change, from a file in `seeds/frame-suggestions/`, with its frame loaded. */
export type Suggestion = {
  id: string
  /** Seconds into the recording where the instruction starts. */
  start: number
  text: string
  frameId: number
  confidence: number
  frame: Frame
}

/**
 * The preview channel for suggestions, beside the frame editor's SEEK_TO_TIME /
 * PLAYBACK_TIME_UPDATE. The player asks for the list once it listens (READY),
 * shows each suggested frame like a normal one, and sends APPROVE back.
 */
const SUGGESTIONS = 'FRAME_SUGGESTIONS'
const READY = 'FRAME_SUGGESTIONS_READY'
const APPROVE = 'APPROVE_SUGGESTION'

export const suggestionTimestamp = (suggestion: Suggestion) => Math.round(suggestion.start)

/** A suggestion is approved once the meditation has its frame at its time, so a reload keeps it. */
export const isApprovedAs = (suggestion: Suggestion, frame: KeyframeData) =>
  String(frame.id) === String(suggestion.frameId) && frame.timestamp === suggestionTimestamp(suggestion)

/** What an editor recognises a frame by, as the frame inserter shows it: its chakra and its tags. */
export function frameTitle(frame: Frame | KeyframeData): string {
  const node = getSubtleSystemNodeLabel(getFrameSubtleSystemNodeSlug(frame))
  const parts = [frame.label || node, frame.tags?.join(', ')].filter(Boolean)
  return parts.length ? parts.join(' · ') : getFrameDisplayLabel(frame)
}

/**
 * Keeps the preview's list of pending suggestions current, and turns an
 * approval into a frame in the meditation's `frames` field — the same unsaved
 * change the frame inserter makes, kept by Save Draft.
 */
export function useFrameSuggestions(suggestions: Suggestion[]) {
  const { iframeRef } = useLivePreviewContext()
  const { value, setValue: setFrames } = useField<KeyframeData[]>({ path: 'frames' })
  const frames = useMemo(() => value ?? [], [value])
  const approved = useMemo(
    () =>
      new Set(
        suggestions.filter((s) => frames.some((f) => isApprovedAs(s, f))).map((s) => s.id),
      ),
    [frames, suggestions],
  )
  const pending = useMemo(
    () => suggestions.filter((s) => !approved.has(s.id)),
    [suggestions, approved],
  )

  const send = useCallback(() => {
    const iframe = iframeRef.current
    const origin = originOf(iframe?.src)
    if (!iframe?.contentWindow || !origin) return
    iframe.contentWindow.postMessage(
      {
        type: SUGGESTIONS,
        suggestions: pending.map((s) => ({
          id: s.id,
          timestamp: suggestionTimestamp(s),
          title: frameTitle(s.frame),
          frame: s.frame,
        })),
      },
      origin,
    )
  }, [iframeRef, pending])

  const approve = useCallback(
    (id: string) => {
      const suggestion = suggestions.find((s) => s.id === id)
      if (!suggestion || approved.has(id)) return
      const timestamp = suggestionTimestamp(suggestion)
      setFrames(
        [
          ...frames.filter((f) => f.timestamp !== timestamp),
          { ...suggestion.frame, timestamp },
        ].sort((a, b) => a.timestamp - b.timestamp),
      )
      toast.success(
        `Added ${frameTitle(suggestion.frame)} at ${formatTime(timestamp)}. Save the draft to keep it.`,
      )
    },
    [approved, frames, setFrames, suggestions],
  )

  useEffect(send, [send])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current
      if (!iframe || event.source !== iframe.contentWindow || event.origin !== originOf(iframe.src))
        return
      if (event.data?.type === READY) send()
      if (event.data?.type === APPROVE && typeof event.data.id === 'string') approve(event.data.id)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [approve, iframeRef, send])

  return { frames, approved }
}
