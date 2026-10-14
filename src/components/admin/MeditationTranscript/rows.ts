import type { KeyframeData } from '@/types/frames'

import { isApprovedAs, isHandledBy, type Suggestion, suggestionTimestamp } from './frames'

export type Segment = { text: string; start: number; end: number }

/** A pause this long between phrases is shown as a moment of silence. */
export const SILENCE_GAP_SECONDS = 10

/** In the shortened view, lines this close to a frame stay: the lead-up to it, and just after. */
export const NEAR_BEFORE_SECONDS = 12
export const NEAR_AFTER_SECONDS = 4

/** Words that usually start a hand instruction, set in bold so the eye finds them. */
export const HAND_CUE =
  /\b(place|put|bring|raise|lift|lower|press|massage|rotate|rub|give|hold|rest|touch|keep|move|take|tap|sweep)\b/i

/** in the meditation · an approved suggestion · a suggestion changed by the editor · waiting */
export type FrameStatus = 'frame' | 'approved' | 'changed' | 'suggested'

export type FrameRowData = {
  type: 'frame'
  key: string
  time: number
  status: FrameStatus
  frame: KeyframeData | Suggestion['frame']
  suggestion?: Suggestion
}
export type LineRow = { type: 'line'; key: string; time: number; index: number }
export type Row =
  | LineRow
  | { type: 'silence'; key: string; time: number; seconds: number }
  | { type: 'gap'; key: string; time: number; to: number; count: number }
  | FrameRowData

/** Narration, silences, the meditation's frames and the waiting suggestions, in order of time. */
export function buildRows(
  segments: Segment[],
  frames: KeyframeData[],
  pending: Suggestion[],
  suggestions: Suggestion[],
): Row[] {
  const rows: Row[] = segments.map((segment, index) => ({
    type: 'line',
    key: `line-${index}`,
    time: segment.start,
    index,
  }))
  segments.forEach((segment, index) => {
    const gap = index > 0 ? segment.start - segments[index - 1].end : 0
    if (gap >= SILENCE_GAP_SECONDS)
      rows.push({
        type: 'silence',
        key: `silence-${index}`,
        time: segments[index - 1].end,
        seconds: Math.round(gap),
      })
  })
  for (const frame of frames) {
    const suggestion = suggestions.find((s) => isHandledBy(s, frame))
    rows.push({
      type: 'frame',
      key: `frame-${frame.timestamp}`,
      time: frame.timestamp,
      status: !suggestion ? 'frame' : isApprovedAs(suggestion, frame) ? 'approved' : 'changed',
      frame,
      suggestion,
    })
  }
  for (const suggestion of pending)
    rows.push({
      type: 'frame',
      key: suggestion.id,
      time: suggestionTimestamp(suggestion),
      status: 'suggested',
      frame: suggestion.frame,
      suggestion,
    })
  // Stable: a frame at the very second a line starts stays after that line.
  return rows.sort((a, b) => a.time - b.time)
}

/** Whether a line belongs in the shortened view: a hand cue, or close to a frame. */
export function isNearFrame(segment: Segment, frameTimes: number[]): boolean {
  if (HAND_CUE.test(segment.text)) return true
  return frameTimes.some(
    (t) =>
      (segment.start >= t - NEAR_BEFORE_SECONDS && segment.start <= t + NEAR_AFTER_SECONDS) ||
      (segment.start <= t && segment.end >= t),
  )
}

/**
 * The shortened view: lines far from any frame fold into one row per run, which shows how many
 * lines and which stretch it hides. Runs listed in `opened` stay unfolded. Silences go, since the
 * folded rows already say where time passes.
 */
export function foldFarLines(rows: Row[], segments: Segment[], opened: ReadonlySet<string>): Row[] {
  const frameTimes = rows.flatMap((row) => (row.type === 'frame' ? [row.time] : []))
  const out: Row[] = []
  let run: LineRow[] = []
  const flush = () => {
    if (!run.length) return
    const key = `gap-${run[0].index}`
    if (opened.has(key)) out.push(...run)
    else
      out.push({
        type: 'gap',
        key,
        time: run[0].time,
        to: segments[run[run.length - 1].index].end,
        count: run.length,
      })
    run = []
  }
  for (const row of rows) {
    if (row.type === 'silence') continue
    if (row.type === 'line' && !isNearFrame(segments[row.index], frameTimes)) {
      run.push(row)
      continue
    }
    flush()
    out.push(row)
  }
  flush()
  return out
}

/** A line split into plain text and hand-cue words. */
export function cueParts(text: string): { text: string; cue: boolean }[] {
  const pattern = new RegExp(HAND_CUE.source, 'gi')
  return text
    .split(pattern)
    .map((part, index) => ({ text: part, cue: index % 2 === 1 }))
    .filter((part) => part.text)
}

/** The phrase playing at `time`, or -1 in a pause. The preview reports whole seconds. */
export function activePhrase(segments: Segment[], time: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (Math.floor(segments[index].start) <= time)
      return time < segments[index].end + 0.5 ? index : -1
  }
  return -1
}

/** m:ss, and m:ss.t for line starts: tenths show which of two close lines a frame follows. */
export function clock(seconds: number, tenths = false): string {
  const whole = Math.floor(seconds)
  const base = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
  return tenths ? `${base}.${Math.floor((seconds - whole) * 10)}` : base
}
