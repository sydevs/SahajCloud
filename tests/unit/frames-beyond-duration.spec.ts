import { describe, expect, it } from 'vitest'

import { countFramesBeyondDuration } from '@/lib/meditations/framesBeyondDuration'

describe('countFramesBeyondDuration', () => {
  it('counts only frames whose timestamp exceeds the duration', () => {
    const frames = [
      { id: 1, timestamp: 10 },
      { id: 2, timestamp: 30 },
      { id: 3, timestamp: 50 },
    ]
    expect(countFramesBeyondDuration(frames, 40)).toBe(1) // only the 50s frame drifts
  })

  it('treats a timestamp equal to the duration as in range', () => {
    expect(countFramesBeyondDuration([{ id: 1, timestamp: 42 }], 42)).toBe(0)
  })

  it('counts every drifted frame', () => {
    const frames = [
      { id: 1, timestamp: 60 },
      { id: 2, timestamp: 75 },
      { id: 3, timestamp: 5 },
    ]
    expect(countFramesBeyondDuration(frames, 42)).toBe(2)
  })

  it('returns 0 when duration is missing, zero, negative, or NaN', () => {
    const frames = [{ id: 1, timestamp: 100 }]
    expect(countFramesBeyondDuration(frames, undefined)).toBe(0)
    expect(countFramesBeyondDuration(frames, null)).toBe(0)
    expect(countFramesBeyondDuration(frames, 0)).toBe(0)
    expect(countFramesBeyondDuration(frames, -5)).toBe(0)
    expect(countFramesBeyondDuration(frames, Number.NaN)).toBe(0)
  })

  it('returns 0 for a non-array frames value', () => {
    expect(countFramesBeyondDuration(undefined, 40)).toBe(0)
    expect(countFramesBeyondDuration(null, 40)).toBe(0)
    expect(countFramesBeyondDuration('not-an-array', 40)).toBe(0)
  })

  it('ignores frames with a missing or non-numeric timestamp', () => {
    const frames = [{ id: 1 }, { id: 2, timestamp: 'x' }, { id: 3, timestamp: 99 }, null]
    expect(countFramesBeyondDuration(frames, 40)).toBe(1) // only the well-formed 99s frame
  })

  it('returns 0 for an empty frames array', () => {
    expect(countFramesBeyondDuration([], 40)).toBe(0)
  })
})
