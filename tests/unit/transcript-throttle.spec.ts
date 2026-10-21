/**
 * The re-transcription cooldown, and the bound it must stay under.
 *
 * The bound is the load-bearing case: a `stalled` row is by definition older
 * than `TRANSCRIPTION_STALL_MS`, so a cooldown longer than that would make the
 * one phase nothing else can clear permanently unretryable — behind a control
 * that always refuses. Nothing but this fails when someone tunes the constant
 * past it (#984).
 */
import { describe, expect, it } from 'vitest'

import {
  RETRANSCRIBE_COOLDOWN_MS,
  retranscribeWaitLabel,
  retranscribeWaitMs,
  TRANSCRIPTION_STALL_MS,
} from '@/lib/meditations/transcriptBounds'

const NOW = Date.parse('2026-10-20T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('RETRANSCRIBE_COOLDOWN_MS', () => {
  it('stays at or under the stall bound, so a stalled row is always retryable', () => {
    expect(RETRANSCRIBE_COOLDOWN_MS).toBeLessThanOrEqual(TRANSCRIPTION_STALL_MS)
  })
})

describe('retranscribeWaitMs', () => {
  it('reports what is left of the cooldown', () => {
    expect(retranscribeWaitMs(ago(4 * 60 * 1000), NOW)).toBe(RETRANSCRIBE_COOLDOWN_MS - 240_000)
  })

  it('answers zero once the cooldown has passed', () => {
    expect(retranscribeWaitMs(ago(RETRANSCRIBE_COOLDOWN_MS), NOW)).toBe(0)
    expect(retranscribeWaitMs(ago(RETRANSCRIBE_COOLDOWN_MS + 1000), NOW)).toBe(0)
  })

  it('answers zero for a row at the stall bound, which is what makes one retryable', () => {
    expect(retranscribeWaitMs(ago(TRANSCRIPTION_STALL_MS), NOW)).toBe(0)
  })

  // Refusing is the direction nothing recovers from: the row would sit behind a
  // control that never opens.
  it.each([undefined, null, '', 'not a date'])('answers zero for %o', (requestedAt) => {
    expect(retranscribeWaitMs(requestedAt, NOW)).toBe(0)
  })
})

describe('retranscribeWaitLabel', () => {
  it.each([
    [1000, '1 second'],
    [2000, '2 seconds'],
    [59_000, '59 seconds'],
    [60_000, '1 minute'],
    [61_000, '2 minutes'],
    [RETRANSCRIBE_COOLDOWN_MS, '10 minutes'],
  ] as const)('words %i ms as %s', (waitMs, label) => {
    expect(retranscribeWaitLabel(waitMs)).toBe(label)
  })
})
