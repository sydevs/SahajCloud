/**
 * The transcript phase, and which phases may be asked for again.
 *
 * One function answers for two consumers — the Transcript tab's notice table
 * and `POST /api/meditations/:id/transcript`'s refusal (#984) — so the table
 * below is what stops a button offering a retry the endpoint refuses. Pure, and
 * away from the tab's own specs, because neither side owns it.
 */
import { describe, expect, it } from 'vitest'

import {
  TRANSCRIPTION_STALL_MS,
  transcriptPhase,
  transcriptPhaseIsRetryable,
} from '@/lib/meditations/transcriptBounds'
import type { MeditationTranscript } from '@/payload-types'

const NOW = Date.parse('2026-10-17T12:00:00.000Z')

const row = (
  overrides: Partial<Pick<MeditationTranscript, 'status' | 'updatedAt'>>,
): Pick<MeditationTranscript, 'status' | 'updatedAt'> => ({
  status: 'completed',
  updatedAt: new Date(NOW).toISOString(),
  ...overrides,
})

describe('transcriptPhase', () => {
  it('reads no row as nothing transcribed yet', () => {
    expect(transcriptPhase(undefined, NOW)).toBe('none')
  })

  it.each([
    ['processing', 'pending'],
    ['failed', 'failed'],
    ['completed', 'completed'],
  ] as const)('reads a fresh %s row as %s', (status, phase) => {
    expect(transcriptPhase(row({ status }), NOW)).toBe(phase)
  })

  it('reads a processing row older than the stall bound as stalled', () => {
    const stale = new Date(NOW - TRANSCRIPTION_STALL_MS - 1000).toISOString()

    expect(transcriptPhase(row({ status: 'processing', updatedAt: stale }), NOW)).toBe('stalled')
  })

  it('leaves a processing row inside the stall bound pending', () => {
    const recent = new Date(NOW - TRANSCRIPTION_STALL_MS + 1000).toISOString()

    expect(transcriptPhase(row({ status: 'processing', updatedAt: recent }), NOW)).toBe('pending')
  })

  it('does not stall a failed or completed row, however old', () => {
    const ancient = new Date(NOW - TRANSCRIPTION_STALL_MS * 100).toISOString()

    expect(transcriptPhase(row({ status: 'failed', updatedAt: ancient }), NOW)).toBe('failed')
    expect(transcriptPhase(row({ status: 'completed', updatedAt: ancient }), NOW)).toBe('completed')
  })

  // An unparseable timestamp makes the comparison NaN, and a NaN comparison is
  // false — so the wait stands, as it does in `jobStage.staleAfterMs`.
  it('keeps the wait on a processing row whose updatedAt cannot be read', () => {
    expect(transcriptPhase(row({ status: 'processing', updatedAt: 'not a date' }), NOW)).toBe(
      'pending',
    )
  })
})

describe('transcriptPhaseIsRetryable', () => {
  it.each(['failed', 'stalled', 'none'] as const)('offers a retry for %s', (phase) => {
    expect(transcriptPhaseIsRetryable(phase)).toBe(true)
  })

  // `pending` has a run in flight, and `completed` has a transcript to read —
  // replacing the recording is how that one is redone.
  it.each(['pending', 'completed'] as const)('refuses one for %s', (phase) => {
    expect(transcriptPhaseIsRetryable(phase)).toBe(false)
  })
})
