import type { KeyframeData } from '@/types/frames'

import { isApprovedAs, isHandledBy, type Suggestion, suggestionTimestamp } from './frames'

export type Segment = { text: string; start: number; end: number }

/** A pause this long between phrases starts a new paragraph. */
export const PARAGRAPH_GAP_SECONDS = 3

/** A pause this long is shown as a moment of silence. */
export const SILENCE_GAP_SECONDS = 10

/** In the shortened view, paragraphs this close to a frame stay: the lead-up to it, and just after. */
export const NEAR_BEFORE_SECONDS = 12
export const NEAR_AFTER_SECONDS = 4

/** Words that usually start a hand instruction: a paragraph with one stays in the shortened view. */
export const HAND_CUE =
  /\b(place|put|bring|raise|lift|lower|press|massage|rotate|rub|give|hold|rest|touch|keep|move|take|tap|sweep)\b/i

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
export type Block =
  | ParagraphBlock
  | FrameBlock
  | { type: 'silence'; key: string; seconds: number }
  | { type: 'gap'; key: string; start: number; end: number; count: number }

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

/** Whether a paragraph belongs in the shortened view: a hand cue, or a phrase close to a frame. */
export function isNearFrame(segments: Segment[], indexes: number[], frameTimes: number[]): boolean {
  return indexes.some((index) => {
    const { start, end, text } = segments[index]
    return (
      HAND_CUE.test(text) ||
      frameTimes.some(
        (t) =>
          (start >= t - NEAR_BEFORE_SECONDS && start <= t + NEAR_AFTER_SECONDS) ||
          (start <= t && end >= t),
      )
    )
  })
}

/**
 * The shortened view: each run of paragraphs far from any frame folds into one row saying how many
 * and which stretch. Runs listed in `opened` stay unfolded. Silences inside a run fold with it.
 */
export function foldFarParagraphs(
  blocks: Block[],
  segments: Segment[],
  opened: ReadonlySet<string>,
): Block[] {
  const frameTimes = blocks.flatMap((block) => (block.type === 'frame' ? [block.time] : []))
  const out: Block[] = []
  let run: Block[] = []
  const flush = () => {
    const paragraphs = run.filter((b): b is ParagraphBlock => b.type === 'paragraph')
    if (paragraphs.length) {
      const key = `gap-${paragraphs[0].key}`
      if (opened.has(key)) out.push(...run)
      else {
        const last = paragraphs[paragraphs.length - 1].indexes
        out.push({
          type: 'gap',
          key,
          start: paragraphs[0].start,
          end: segments[last[last.length - 1]].end,
          count: paragraphs.length,
        })
      }
    } else out.push(...run)
    run = []
  }
  for (const block of blocks) {
    const far =
      (block.type === 'paragraph' && !isNearFrame(segments, block.indexes, frameTimes)) ||
      (block.type === 'silence' && run.length > 0)
    if (far) {
      run.push(block)
      continue
    }
    flush()
    out.push(block)
  }
  flush()
  return out
}

/** m:ss */
export function clock(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
