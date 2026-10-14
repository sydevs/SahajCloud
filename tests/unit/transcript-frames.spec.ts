/**
 * The frame edits the Transcript tab offers (#898 proposal): which suggestions still wait, and
 * what Approve, Change and Remove do to the meditation's `frames` list.
 */
import { describe, expect, it } from 'vitest'

import {
  approveFrames,
  isApprovedAs,
  isHandledBy,
  pendingSuggestions,
  placeFrame,
  removeFrame,
  type Suggestion,
  suggestionTimestamp,
} from '@/components/admin/MeditationTranscript/frames'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

const frame = (id: number) => ({ id }) as unknown as Frame
const at = (id: number, timestamp: number) => ({ id, timestamp }) as KeyframeData

function suggestion(
  id: string,
  start: number,
  frameId: number,
  replaces?: Suggestion['replaces'],
): Suggestion {
  return { id, start, text: '', frameId, frame: frame(frameId), replaces }
}

describe('suggestionTimestamp', () => {
  it('rounds the instruction start to the whole second a frame sits on', () => {
    expect(suggestionTimestamp(suggestion('s', 89.6, 4))).toBe(90)
    expect(suggestionTimestamp(suggestion('s', 89.4, 4))).toBe(89)
  })
})

describe('isHandledBy / isApprovedAs', () => {
  const s = suggestion('s', 90.2, 4)

  it('counts any frame at the suggestion second as handling it', () => {
    expect(isHandledBy(s, at(4, 90))).toBe(true)
    expect(isHandledBy(s, at(9, 90))).toBe(true)
    expect(isHandledBy(s, at(4, 91))).toBe(false)
  })

  it('counts it approved only with its own frame', () => {
    expect(isApprovedAs(s, at(4, 90))).toBe(true)
    expect(isApprovedAs(s, at(9, 90))).toBe(false)
  })

  it('compares frame ids as strings, since stored ids may be either', () => {
    expect(isApprovedAs(s, { id: '4', timestamp: 90 } as KeyframeData)).toBe(true)
  })
})

describe('pendingSuggestions', () => {
  const a = suggestion('a', 10, 4)
  const b = suggestion('b', 20, 5)
  const c = suggestion('c', 30, 6)

  it('keeps suggestions with no frame at their second', () => {
    expect(pendingSuggestions([a, b, c], [], new Set()).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops approved and changed ones', () => {
    expect(
      pendingSuggestions([a, b, c], [at(4, 10), at(99, 20)], new Set()).map((s) => s.id),
    ).toEqual(['c'])
  })

  it('drops the ones set aside', () => {
    expect(pendingSuggestions([a, b, c], [], new Set(['b'])).map((s) => s.id)).toEqual(['a', 'c'])
  })
})

describe('placeFrame', () => {
  it('adds a frame in time order', () => {
    expect(placeFrame([at(1, 0), at(2, 50)], frame(3), 20).map((f) => [f.id, f.timestamp])).toEqual(
      [
        [1, 0],
        [3, 20],
        [2, 50],
      ],
    )
  })

  it('replaces the frame at the same second, so there is never two', () => {
    expect(placeFrame([at(1, 0), at(2, 20)], frame(3), 20).map((f) => f.id)).toEqual([1, 3])
  })

  it('also drops the frame at alsoDrop', () => {
    expect(placeFrame([at(1, 0), at(2, 25)], frame(3), 20, 25).map((f) => f.id)).toEqual([1, 3])
  })

  it('leaves the input untouched', () => {
    const frames = [at(1, 0)]
    placeFrame(frames, frame(3), 20)
    expect(frames).toEqual([at(1, 0)])
  })
})

describe('approveFrames', () => {
  it("puts the suggestion's frame at its second", () => {
    const result = approveFrames([at(1, 0)], suggestion('s', 89.6, 4))
    expect(result.map((f) => [f.id, f.timestamp])).toEqual([
      [1, 0],
      [4, 90],
    ])
  })

  it('replaces the editor frame the suggestion disagrees with, even at another second', () => {
    const result = approveFrames(
      [at(1, 0), at(2, 92)],
      suggestion('s', 90, 4, { timestamp: 92, frameId: 2 }),
    )
    expect(result.map((f) => [f.id, f.timestamp])).toEqual([
      [1, 0],
      [4, 90],
    ])
  })

  it("uses the editor's pick when one is given", () => {
    expect(approveFrames([], suggestion('s', 90, 4), frame(7)).map((f) => f.id)).toEqual([7])
  })
})

describe('removeFrame', () => {
  it('removes only the frame at that second', () => {
    expect(removeFrame([at(1, 0), at(2, 20), at(3, 40)], 20).map((f) => f.id)).toEqual([1, 3])
  })
})
