/**
 * `stampSegmentCount` — the stored cue count that lets `status` be read without
 * the cues (#1087 review).
 */
import { describe, expect, it } from 'vitest'

import { stampSegmentCount } from '@/collections/Transcripts/hooks/stampSegmentCount'

const run = (data: Record<string, unknown>) =>
  stampSegmentCount({ data } as never) as Record<string, unknown>

describe('stampSegmentCount', () => {
  it('counts the cues the write carries', () => {
    expect(run({ segments: [{ content: 'one' }, { content: 'two' }] }).segmentCount).toBe(2)
  })

  it('counts a cleared column as none', () => {
    // A replaced recording nulls the column, and the row must not keep the
    // previous run's count and read as completed.
    expect(run({ segments: null }).segmentCount).toBe(0)
    expect(run({ segments: [] }).segmentCount).toBe(0)
  })

  it('leaves the stored count alone for a write that names no cues', () => {
    // The cues it counts are the ones already stored, so a patch touching only
    // `audioFilename` must not zero it.
    const patched = run({ audioFilename: 'meditation.mp3' })

    expect('segmentCount' in patched).toBe(false)
    expect(patched.audioFilename).toBe('meditation.mp3')
  })

  it('does not mutate the data it was handed', () => {
    const data = { segments: [{ content: 'one' }] }

    run(data)

    expect('segmentCount' in data).toBe(false)
  })
})
