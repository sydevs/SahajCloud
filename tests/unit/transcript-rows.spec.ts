/**
 * The Transcript tab's blocks (#898 proposal): the #897 paragraphs with frames set in where the
 * picture changes, the shortened "only text near frames" view, and the phrase playing.
 */
import { describe, expect, it } from 'vitest'

import type { Suggestion } from '@/components/admin/MeditationTranscript/frames'
import {
  activePhrase,
  type Block,
  buildBlocks,
  clock,
  foldFarParagraphs,
  frameBlocks,
  isNearFrame,
  lastStarted,
  markRuns,
  NEAR_AFTER_SECONDS,
  NEAR_BEFORE_SECONDS,
  quotedRanges,
  type Segment,
} from '@/components/admin/MeditationTranscript/rows'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

const seg = (start: number, end: number, text = 'And here we pray.'): Segment => ({
  start,
  end,
  text,
})
const at = (id: number, timestamp: number) => ({ id, timestamp }) as KeyframeData
const suggestion = (id: string, start: number, frameId: number): Suggestion => ({
  id,
  start,
  text: '',
  frameId,
  frame: { id: frameId } as unknown as Frame,
})
const shape = (blocks: Block[]) =>
  blocks.map((b) =>
    b.type === 'paragraph'
      ? `p[${b.indexes.join(',')}]`
      : b.type === 'frame'
        ? `frame@${b.time}`
        : b.type,
  )
const framesAt = (...times: number[]) =>
  frameBlocks(
    times.map((t, i) => at(i + 1, t)),
    [],
    [],
  )

describe('frameBlocks', () => {
  it('labels each frame by what happened to the suggestion at its second, in time order', () => {
    const suggestions = [suggestion('a', 6, 4), suggestion('b', 31, 5), suggestion('c', 33, 6)]
    const blocks = frameBlocks([at(9, 31), at(4, 6), at(7, 50)], [suggestions[2]], suggestions)
    expect(blocks.map((b) => `${b.time}:${b.status}`)).toEqual([
      '6:approved',
      '31:changed',
      '33:suggested',
      '50:frame',
    ])
  })
})

describe('buildBlocks', () => {
  // Two paragraphs: phrases 0–1 (no pause), then a 2-s pause keeps 2 in it; a 20-s pause starts 3.
  const segments = [seg(0, 4), seg(4.5, 9), seg(11, 14), seg(34, 38)]

  it('groups phrases into paragraphs and marks a long silence', () => {
    expect(shape(buildBlocks(segments, []))).toEqual(['p[0,1,2]', 'silence', 'p[3]'])
  })

  it('splits a paragraph after the phrase playing when a frame starts', () => {
    expect(shape(buildBlocks(segments, framesAt(5)))).toEqual([
      'p[0,1]',
      'frame@5',
      'p[2]',
      'silence',
      'p[3]',
    ])
  })

  it('puts a frame at the end of a paragraph before the silence that follows', () => {
    expect(shape(buildBlocks(segments, framesAt(20)))).toEqual([
      'p[0,1,2]',
      'frame@20',
      'silence',
      'p[3]',
    ])
  })

  it('puts a frame before the first phrase at the top', () => {
    expect(shape(buildBlocks([seg(2, 4)], framesAt(0)))).toEqual(['frame@0', 'p[0]'])
  })

  it('keeps several frames after the same phrase in time order', () => {
    expect(shape(buildBlocks(segments, framesAt(1, 2)))).toEqual([
      'p[0]',
      'frame@1',
      'frame@2',
      'p[1,2]',
      'silence',
      'p[3]',
    ])
  })

  it('gives the text after a frame its own time', () => {
    const blocks = buildBlocks(segments, framesAt(5))
    expect(blocks.find((b) => b.type === 'paragraph' && b.indexes[0] === 2)).toMatchObject({
      start: 11,
    })
  })
})

describe('lastStarted / activePhrase', () => {
  const segments = [seg(0.4, 4), seg(5.7, 9)]

  it('counts a phrase from the whole second it starts in', () => {
    expect(lastStarted(segments, 5)).toBe(1)
    expect(lastStarted(segments, -1)).toBe(-1)
  })

  it('is -1 in a pause', () => {
    expect(activePhrase(segments, 0)).toBe(0)
    expect(activePhrase([seg(0, 2), seg(20, 22)], 10)).toBe(-1)
  })
})

describe('isNearFrame', () => {
  it('keeps a paragraph with a hand cue anywhere', () => {
    expect(isNearFrame([seg(500, 504, 'Now place your right hand on the heart.')], [0], [])).toBe(
      true,
    )
  })

  it('keeps the lead-up to a frame and just after it, and nothing further', () => {
    expect(isNearFrame([seg(100 - NEAR_BEFORE_SECONDS, 90)], [0], [100])).toBe(true)
    expect(isNearFrame([seg(100 + NEAR_AFTER_SECONDS, 106)], [0], [100])).toBe(true)
    expect(isNearFrame([seg(100 - NEAR_BEFORE_SECONDS - 1, 88)], [0], [100])).toBe(false)
    expect(isNearFrame([seg(100 + NEAR_AFTER_SECONDS + 1, 108)], [0], [100])).toBe(false)
  })

  it('does not count a cue inside another word', () => {
    expect(isNearFrame([seg(0, 2, 'a peaceful replacement')], [0], [])).toBe(false)
  })
})

describe('foldFarParagraphs', () => {
  const segments = [seg(0, 2), seg(20, 22), seg(40, 42), seg(95, 97)]
  const blocks = buildBlocks(segments, framesAt(100))

  it('folds each run of far paragraphs, with its silences, into one row', () => {
    const folded = foldFarParagraphs(blocks, segments, new Set())
    expect(shape(folded)).toEqual(['gap', 'p[3]', 'frame@100'])
    expect(folded[0]).toMatchObject({ count: 3, start: 0, end: 42 })
  })

  it('leaves an opened run unfolded, silences included', () => {
    const key = (foldFarParagraphs(blocks, segments, new Set())[0] as { key: string }).key
    expect(shape(foldFarParagraphs(blocks, segments, new Set([key])))).toEqual([
      'p[0]',
      'silence',
      'p[1]',
      'silence',
      'p[2]',
      'silence',
      'p[3]',
      'frame@100',
    ])
  })
})

describe('quotedRanges', () => {
  const segments = [
    seg(0, 4, 'Breathe in.'),
    seg(5, 9, 'Put your awareness on your heart and just breathe.'),
    seg(10, 12, 'Press down and rotate.'),
    seg(12.5, 14, 'Slowly, clockwise.'),
  ]
  const quote = (start: number, text: string) => [...quotedRanges(segments, [{ start, text }])]

  it('marks the quoted words, not the rest of the phrase, ignoring case', () => {
    expect(quote(5.06, 'put your awareness on your heart and')).toEqual([
      [1, [{ start: 0, end: 36 }]],
    ])
  })

  it('finds a quote that starts mid-phrase', () => {
    expect(quote(10.4, 'rotate.')).toEqual([[2, [{ start: 15, end: 22 }]]])
  })

  it('carries a quote across into the next phrase', () => {
    expect(quote(10, 'and rotate. Slowly,')).toEqual([
      [2, [{ start: 11, end: 22 }]],
      [3, [{ start: 0, end: 7 }]],
    ])
  })

  it('marks the whole phrase when the quote is not near its start', () => {
    expect(quote(10, 'Breathe in.')).toEqual([[2, [{ start: 0, end: 22 }]]])
  })
})

describe('markRuns', () => {
  it('cuts text into marked and unmarked runs, merging overlaps', () => {
    expect(
      markRuns('Press down and rotate.', [
        { start: 6, end: 10 },
        { start: 8, end: 14 },
      ]),
    ).toEqual([
      { text: 'Press ', marked: false },
      { text: 'down and', marked: true },
      { text: ' rotate.', marked: false },
    ])
  })

  it('leaves text without ranges whole', () => {
    expect(markRuns('Breathe in.')).toEqual([{ text: 'Breathe in.', marked: false }])
  })
})

describe('clock', () => {
  it('formats m:ss', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(754.9)).toBe('12:34')
  })
})
