'use client'

import { useEffect, useState } from 'react'

import { TRANSCRIPTION_STALL_MS } from '@/lib/meditations/transcriptStall'

/**
 * Re-render when a wait becomes a stall.
 *
 * ⚠ **A poll is not a render.** SWR compares what it fetched and renders
 * nothing when it matches, and a run nothing will finish answers the same row
 * every time — the one case the stall notice exists for. The playhead is no
 * help either: it ticks on a preview message, and nothing is playing while a
 * transcription is in flight. So the bound passes unobserved without this
 * timer, and the in-progress notice and its poll both stay up for good.
 *
 * An unparseable or already-passed `updatedAt` schedules nothing: the phase
 * the next render reads is then already the right one.
 */
export function useStallDeadline(updatedAt: string | undefined): void {
  const [, recheck] = useState(0)

  useEffect(() => {
    if (!updatedAt) return
    const remaining = Date.parse(updatedAt) + TRANSCRIPTION_STALL_MS - Date.now()
    if (!(remaining > 0)) return
    const timer = setTimeout(() => recheck((count) => count + 1), remaining)
    return () => clearTimeout(timer)
  }, [updatedAt])
}
