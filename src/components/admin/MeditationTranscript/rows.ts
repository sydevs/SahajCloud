import type { KeyframeData } from '@/types/frames'

import { isApprovedAs, isHandledBy, type Suggestion, suggestionTimestamp } from './frames'

export type Segment = { text: string; start: number; end: number }

/** A pause this long between phrases starts a new paragraph. */
export const PARAGRAPH_GAP_SECONDS = 3

/** A pause this long is shown as a moment of silence. */
export const SILENCE_GAP_SECONDS = 10

/** in the meditation · an approved suggestion · a suggestion changed by the editor · waiting */
export type FrameStatus = 'frame' | 'approved' | 'changed' | 'suggested'

export type FrameBlock = {
  type: 'frame'
  key: string
  time: number
  status: FrameStatus
  frame: KeyframeData | Suggestion['frame']
  suggestion?: Suggestion
}
export type ParagraphBlock = { type: 'paragraph'; key: string; start: number; indexes: number[] }
export type Block = ParagraphBlock | FrameBlock | { type: 'silence'; key: string; seconds: number }

/** The last phrase started by `time`, or -1 before the first. The preview reports whole seconds. */
export function lastStarted(segments: Segment[], time: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (Math.floor(segments[index].start) <= time) return index
  }
  return -1
}

/** The phrase playing at `time`, or -1 in a pause. */
export function activePhrase(segments: Segment[], time: number): number {
  const index = lastStarted(segments, time)
  return index >= 0 && time < segments[index].end + 0.5 ? index : -1
}

/** The meditation's frames and the waiting suggestions, each with its status, in time order. */
export function frameBlocks(
  frames: KeyframeData[],
  pending: Suggestion[],
  suggestions: Suggestion[],
): FrameBlock[] {
  const blocks: FrameBlock[] = frames.map((frame) => {
    const suggestion = suggestions.find((s) => isHandledBy(s, frame))
    return {
      type: 'frame',
      key: `frame-${frame.timestamp}`,
      time: frame.timestamp,
      status: !suggestion ? 'frame' : isApprovedAs(suggestion, frame) ? 'approved' : 'changed',
      frame,
      suggestion,
    }
  })
  for (const suggestion of pending)
    blocks.push({
      type: 'frame',
      key: suggestion.id,
      time: suggestionTimestamp(suggestion),
      status: 'suggested',
      frame: suggestion.frame,
      suggestion,
    })
  return blocks.sort((a, b) => a.time - b.time)
}

/**
 * The transcript as paragraphs (speech between pauses of PARAGRAPH_GAP_SECONDS), with each frame
 * after the phrase playing when it starts. A frame inside a paragraph splits it there, so the
 * card sits exactly where the picture changes and the text after it carries its own time.
 */
export function buildBlocks(segments: Segment[], frames: FrameBlock[]): Block[] {
  const anchored = new Map<number, FrameBlock[]>()
  for (const frame of frames) {
    const index = lastStarted(segments, frame.time)
    anchored.set(index, [...(anchored.get(index) ?? []), frame])
  }

  const blocks: Block[] = [...(anchored.get(-1) ?? [])]
  let piece: number[] = []
  const closePiece = () => {
    if (!piece.length) return
    blocks.push({
      type: 'paragraph',
      key: `p-${piece[0]}`,
      start: segments[piece[0]].start,
      indexes: piece,
    })
    piece = []
  }

  segments.forEach((segment, index) => {
    const gap = index > 0 ? segment.start - segments[index - 1].end : 0
    if (index > 0 && gap >= PARAGRAPH_GAP_SECONDS) {
      closePiece()
      if (gap >= SILENCE_GAP_SECONDS)
        blocks.push({ type: 'silence', key: `silence-${index}`, seconds: Math.round(gap) })
    }
    piece.push(index)
    const here = anchored.get(index)
    if (here) {
      closePiece()
      blocks.push(...here)
    }
  })
  closePiece()
  return blocks
}

/** Whether a quote's suggestion still waits, or already put a frame in the meditation. */
export type QuoteKind = 'waiting' | 'added'

/** Characters `start` to `end` of one phrase's text, quoted by a suggestion. */
export type TextRange = { start: number; end: number; kind: QuoteKind }

/** A quote is looked for this many phrases on from where its suggestion starts. */
const QUOTE_REACH = 3

/**
 * The words each suggestion quotes, as ranges per phrase index, so the transcript can show what
 * prompted it. A quote may start mid-phrase. It is cut at its frame's card: words past the card
 * would read as belonging to the next frame. One not found near its start (an edited
 * transcript) marks the whole phrase playing there instead.
 */
export function quotedRanges(
  segments: Segment[],
  suggestions: (Pick<Suggestion, 'start' | 'text'> & { kind: QuoteKind })[],
): Map<number, TextRange[]> {
  const offsets: number[] = []
  let haystack = ''
  for (const segment of segments) {
    offsets.push(haystack.length)
    haystack += `${segment.text.toLowerCase()} `
  }
  const ranges = new Map<number, TextRange[]>()
  const add = (index: number, range: TextRange) =>
    ranges.set(index, [...(ranges.get(index) ?? []), range])

  for (const suggestion of suggestions) {
    const first = Math.max(0, lastStarted(segments, suggestion.start))
    if (!segments[first]) continue
    // The card follows the phrase playing at the frame's whole second (see buildBlocks).
    const card = Math.max(first, lastStarted(segments, suggestionTimestamp(suggestion)))
    const needle = suggestion.text.trim().toLowerCase()
    const from = needle ? haystack.indexOf(needle, offsets[first]) : -1
    const limit = offsets[first + QUOTE_REACH] ?? haystack.length
    const to = Math.min(from + needle.length, offsets[card] + segments[card].text.length)
    if (from < 0 || from >= limit || to <= from) {
      add(first, { start: 0, end: segments[first].text.length, kind: suggestion.kind })
      continue
    }
    for (let index = first; index <= card; index += 1) {
      const start = Math.max(from, offsets[index]) - offsets[index]
      const end = Math.min(to, offsets[index] + segments[index].text.length) - offsets[index]
      if (end > start) add(index, { start, end, kind: suggestion.kind })
    }
  }
  return ranges
}

/** `text` cut into runs by `ranges`, each with the kind of quote over it; where two overlap, a waiting one shows. */
export function markRuns(
  text: string,
  ranges: TextRange[] = [],
): { text: string; kind?: QuoteKind }[] {
  if (!ranges.length) return [{ text }]
  const kinds = new Array<QuoteKind | undefined>(text.length)
  const ordered = [
    ...ranges.filter((range) => range.kind === 'added'),
    ...ranges.filter((range) => range.kind === 'waiting'),
  ]
  for (const range of ordered) kinds.fill(range.kind, range.start, range.end)
  const runs: { text: string; kind?: QuoteKind }[] = []
  for (let index = 0; index < text.length; index += 1) {
    const last = runs[runs.length - 1]
    if (last && last.kind === kinds[index]) last.text += text[index]
    else runs.push({ text: text[index], kind: kinds[index] })
  }
  return runs
}

/** Which of the cards at these tops (in page order) to review next: the first below `edge`, else the first. */
export const nextBelow = (tops: number[], edge: number) =>
  Math.max(
    0,
    tops.findIndex((top) => top > edge),
  )

/** m:ss */
export function clock(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
