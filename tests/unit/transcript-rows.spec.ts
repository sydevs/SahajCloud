/**
 * The Transcript tab's rows (#898 proposal): narration, silences and frames in time order, the
 * shortened "only lines near frames" view, hand-cue words, and the phrase playing.
 */
import { describe, expect, it } from 'vitest'

import type { Suggestion } from '@/components/admin/MeditationTranscript/frames'
import {
  activePhrase,
  buildRows,
  clock,
  cueParts,
  foldFarLines,
  isNearFrame,
  NEAR_AFTER_SECONDS,
  NEAR_BEFORE_SECONDS,
  type Row,
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
const kinds = (rows: Row[]) =>
  rows.map((r) => (r.type === 'frame' ? `${r.type}:${r.status}` : r.type))

describe('buildRows', () => {
  const segments = [seg(0, 4), seg(5, 9), seg(30, 34)]

  it('puts lines, silences and frames in time order', () => {
    const rows = buildRows(segments, [at(1, 6)], [], [])
    expect(kinds(rows)).toEqual(['line', 'line', 'frame:frame', 'silence', 'line'])
  })

  it('marks a silence only for a pause of ten seconds or more', () => {
    const rows = buildRows([seg(0, 4), seg(13.9, 15), seg(25, 26)], [], [], [])
    expect(rows.filter((r) => r.type === 'silence')).toHaveLength(1)
  })

  it('keeps a frame after a line starting at the same second', () => {
    const rows = buildRows([seg(5, 9)], [at(1, 5)], [], [])
    expect(kinds(rows)).toEqual(['line', 'frame:frame'])
  })

  it('labels frames by what happened to the suggestion at their second', () => {
    const suggestions = [suggestion('a', 6, 4), suggestion('b', 31, 5), suggestion('c', 33, 6)]
    const rows = buildRows(segments, [at(4, 6), at(9, 31)], [suggestions[2]], suggestions)
    expect(kinds(rows).filter((k) => k.startsWith('frame'))).toEqual([
      'frame:approved',
      'frame:changed',
      'frame:suggested',
    ])
  })
})

describe('isNearFrame', () => {
  it('keeps a line with a hand cue anywhere', () => {
    expect(isNearFrame(seg(500, 504, 'Now place your right hand on the heart.'), [])).toBe(true)
  })

  it('keeps the lead-up to a frame and just after it', () => {
    expect(isNearFrame(seg(100 - NEAR_BEFORE_SECONDS, 90), [100])).toBe(true)
    expect(isNearFrame(seg(100 + NEAR_AFTER_SECONDS, 106), [100])).toBe(true)
    expect(isNearFrame(seg(100 - NEAR_BEFORE_SECONDS - 1, 88), [100])).toBe(false)
    expect(isNearFrame(seg(100 + NEAR_AFTER_SECONDS + 1, 108), [100])).toBe(false)
  })

  it('keeps a long line that is still playing when the frame starts', () => {
    expect(isNearFrame(seg(60, 110), [100])).toBe(true)
  })
})

describe('foldFarLines', () => {
  const segments = [seg(0, 2), seg(20, 22), seg(40, 42), seg(60, 62), seg(95, 97)]
  const rows = buildRows(segments, [at(1, 100)], [], [])

  it('folds each run of far lines into one row saying how many and which stretch', () => {
    const folded = foldFarLines(rows, segments, new Set())
    const gap = folded.find((r) => r.type === 'gap')
    expect(kinds(folded)).toEqual(['gap', 'line', 'frame:frame'])
    expect(gap).toMatchObject({ count: 4, time: 0, to: 62 })
  })

  it('leaves an opened run unfolded', () => {
    expect(kinds(foldFarLines(rows, segments, new Set(['gap-0'])))).toEqual([
      'line',
      'line',
      'line',
      'line',
      'line',
      'frame:frame',
    ])
  })

  it('drops silences, since folded rows already say where time passes', () => {
    expect(foldFarLines(rows, segments, new Set(['gap-0'])).some((r) => r.type === 'silence')).toBe(
      false,
    )
  })
})

describe('cueParts', () => {
  it('splits out hand-cue words, whatever their case', () => {
    expect(cueParts('Now Place your hand and keep it there')).toEqual([
      { text: 'Now ', cue: false },
      { text: 'Place', cue: true },
      { text: ' your hand and ', cue: false },
      { text: 'keep', cue: true },
      { text: ' it there', cue: false },
    ])
  })

  it('does not match inside other words', () => {
    expect(cueParts('a peaceful replacement').every((p) => !p.cue)).toBe(true)
  })

  it('returns plain text unchanged', () => {
    expect(cueParts('And here we pray.')).toEqual([{ text: 'And here we pray.', cue: false }])
  })
})

describe('activePhrase', () => {
  const segments = [seg(0.4, 4), seg(5.7, 9)]

  it('finds the phrase playing at a whole second, counting from the second it starts in', () => {
    expect(activePhrase(segments, 0)).toBe(0)
    expect(activePhrase(segments, 5)).toBe(1)
  })

  it('is -1 in a pause and before the first phrase', () => {
    expect(activePhrase(segments, -1)).toBe(-1)
    expect(activePhrase([seg(0, 2), seg(20, 22)], 10)).toBe(-1)
  })
})

describe('clock', () => {
  it('formats m:ss, with tenths on request', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(754.36)).toBe('12:34')
    expect(clock(754.36, true)).toBe('12:34.3')
  })
})
