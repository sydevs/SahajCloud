/**
 * The Transcript tab's pure logic: how phrases fall into paragraphs and
 * silences, and which phrase the playhead is in. Which notice it shows is
 * `transcript-phase.spec.ts`'s, since the endpoint reads that too; the URLs it
 * builds are pinned in `admin-locale-urls.spec.ts`, with their siblings.
 *
 * Every cue time here is **milliseconds**, as `transcripts` stores
 * them; the playhead the preview reports is **seconds**.
 */
import { describe, expect, it } from 'vitest'

import {
  activeSegmentIndex,
  exactSecond,
  groupTranscript,
  seekSecond,
} from '@/components/admin/RecordingTranscript/transcriptModel'
import type { TranscriptSegment } from '@/lib/meditations/transcript'

const cue = (startTimeMs: number, endTimeMs: number): TranscriptSegment => ({
  content: `${startTimeMs}-${endTimeMs}`,
  startTimeMs,
  endTimeMs,
})

describe('groupTranscript', () => {
  it('keeps phrases with pauses under three seconds in one paragraph', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(3000, 5000), cue(7500, 9000)])

    expect(paragraphs).toEqual([{ startTimeMs: 0, segmentIndexes: [0, 1, 2], silenceAfter: false }])
  })

  it('starts a paragraph at a pause of exactly three seconds', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(5000, 6000)])

    expect(paragraphs.map((paragraph) => paragraph.segmentIndexes)).toEqual([[0], [1]])
    expect(paragraphs[0].silenceAfter).toBe(false)
  })

  it('marks a silence after a paragraph a pause of ten seconds ended', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(12000, 14000), cue(15000, 16000)])

    expect(paragraphs).toEqual([
      { startTimeMs: 0, segmentIndexes: [0], silenceAfter: true },
      { startTimeMs: 12000, segmentIndexes: [1, 2], silenceAfter: false },
    ])
  })

  it('leaves a pause just under ten seconds unmarked', () => {
    const paragraphs = groupTranscript([cue(0, 2000), cue(11999, 13000)])

    expect(paragraphs[0].silenceAfter).toBe(false)
  })

  it('has nothing to group without phrases', () => {
    expect(groupTranscript([])).toEqual([])
  })
})

describe('activeSegmentIndex', () => {
  const segments = [cue(2000, 4000), cue(10000, 12000)]

  it('finds the phrase being spoken from a seconds playhead', () => {
    expect(activeSegmentIndex(segments, 3)).toBe(0)
    expect(activeSegmentIndex(segments, 10)).toBe(1)
  })

  it('lights a phrase from the whole second a click seeks to', () => {
    expect(seekSecond(91120)).toBe(91)
    expect(activeSegmentIndex([cue(91120, 95000)], 91)).toBe(0)
  })

  it('keeps a phrase lit for half a second after it ends', () => {
    expect(activeSegmentIndex(segments, 4.4)).toBe(0)
  })

  it('lights nothing before the first phrase or in a pause', () => {
    expect(activeSegmentIndex(segments, 1)).toBe(-1)
    expect(activeSegmentIndex(segments, 6)).toBe(-1)
    expect(activeSegmentIndex(segments, 20)).toBe(-1)
  })
})

/**
 * A file's player seeks to the millisecond, so a phrase lights from its own
 * start there rather than from the whole second the live preview rounds to —
 * with cues this short, that second would light it while the one before it is
 * still being spoken.
 */
describe('activeSegmentIndex on a player that seeks exactly', () => {
  const segments = [cue(10000, 12400), cue(12800, 14000)]

  it('keeps the earlier phrase lit until the next one starts', () => {
    expect(activeSegmentIndex(segments, 12.5, exactSecond)).toBe(0)
    expect(activeSegmentIndex(segments, 12.5)).toBe(1)
  })

  it('lights a phrase from the time a click on it seeks to', () => {
    expect(exactSecond(12800)).toBe(12.8)
    expect(activeSegmentIndex(segments, 12.8, exactSecond)).toBe(1)
  })

  // An element seeked to 12.8 can read back a hair less.
  it('lights it for a playhead a hair short of its start', () => {
    expect(activeSegmentIndex(segments, 12.79, exactSecond)).toBe(1)
    expect(activeSegmentIndex(segments, 12.7, exactSecond)).toBe(0)
  })
})
