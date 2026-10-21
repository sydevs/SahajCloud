'use client'

import { useEffect, useState } from 'react'

import type { JobStageConfig } from '@/components/admin/JobStageView/stages'
import type { MeditationTranscript as TranscriptRow } from '@/payload-types'

import { type TranscriptPhase, transcriptPhase } from './transcriptModel'

/**
 * Which notice the tab shows, and the one re-render that lets `stalled` reach
 * the screen.
 *
 * ⚠ **A poll is not a render.** SWR compares what it fetched and renders
 * nothing when it matches, and a run nothing will finish answers the same row
 * every time — the one case the stall notice exists for. The playhead is no
 * help either: it ticks on a preview message, and nothing is playing while a
 * transcription is in flight. So the bound passes unobserved without this
 * timer, and the in-progress notice and its poll both stay up for good.
 *
 * The derivation and its timer are one hook because neither is any use alone,
 * and a caller holding the phase without the timer is exactly that defect.
 *
 * Only a wait has a bound ahead of it. Every other phase is final until the
 * row changes, which SWR renders on its own, and an unparseable or
 * already-passed `updatedAt` reads as the phase it already is.
 *
 * A collection declaring no `staleAfterMs` has no bound to wake for, and
 * `transcriptPhase` never reads `stalled` there, so the timer stands down with
 * it rather than firing on a phase that cannot change.
 */
export function useTranscriptPhase(
  config: JobStageConfig,
  row: TranscriptRow | undefined,
): TranscriptPhase {
  const [, recheck] = useState(0)
  const phase = transcriptPhase(config, row)
  const { staleAfterMs } = config
  const waitingSince = phase === 'pending' ? row?.updatedAt : undefined

  useEffect(() => {
    if (!waitingSince || staleAfterMs === undefined) return
    const remaining = Date.parse(waitingSince) + staleAfterMs - Date.now()
    if (!(remaining > 0)) return
    const timer = setTimeout(() => recheck((count) => count + 1), remaining)
    return () => clearTimeout(timer)
  }, [staleAfterMs, waitingSince])

  return phase
}
