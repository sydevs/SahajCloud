import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

/** A suggested frame change, from a file in `seeds/frame-suggestions/`, with its frame loaded. */
export type Suggestion = {
  id: string
  /** Seconds into the recording where the instruction starts. */
  start: number
  text: string
  frameId: number
  /** position, movement, return or unsure: how the suggestion reads the instruction. */
  kind?: string
  /** One sentence on why this picture, shown to the editor. */
  reason?: string
  /** An editor frame this suggestion disagrees with, which approving replaces. */
  replaces?: { timestamp: number; frameId: number }
  frame: Frame
}

/** Frames sit on whole seconds. */
export const suggestionTimestamp = (suggestion: Suggestion) => Math.round(suggestion.start)

/**
 * A suggestion is handled once the meditation has a frame at its time: its own frame (approved)
 * or the one an editor picked instead. Derived from the frames, so a reload keeps it.
 */
export const isHandledBy = (suggestion: Suggestion, frame: KeyframeData) =>
  frame.timestamp === suggestionTimestamp(suggestion)

export const isApprovedAs = (suggestion: Suggestion, frame: KeyframeData) =>
  isHandledBy(suggestion, frame) && String(frame.id) === String(suggestion.frameId)

/** Suggestions still waiting: not handled by a frame, and not set aside by the editor. */
export function pendingSuggestions(
  suggestions: Suggestion[],
  frames: KeyframeData[],
  setAside: ReadonlySet<string>,
): Suggestion[] {
  return suggestions.filter(
    (s) => !setAside.has(s.id) && !frames.some((frame) => isHandledBy(s, frame)),
  )
}

const byTime = (a: KeyframeData, b: KeyframeData) => a.timestamp - b.timestamp

/** `frames` with `frame` at `timestamp`, replacing whatever was at that second and at `alsoDrop`. */
export function placeFrame(
  frames: KeyframeData[],
  frame: Frame | KeyframeData,
  timestamp: number,
  alsoDrop?: number,
): KeyframeData[] {
  return [
    ...frames.filter((f) => f.timestamp !== timestamp && f.timestamp !== alsoDrop),
    { ...frame, timestamp } as KeyframeData,
  ].sort(byTime)
}

/** Approving puts the suggestion's frame (or the editor's pick) at its time, replacing the frame it disagrees with. */
export const approveFrames = (
  frames: KeyframeData[],
  suggestion: Suggestion,
  frame: Frame = suggestion.frame,
) => placeFrame(frames, frame, suggestionTimestamp(suggestion), suggestion.replaces?.timestamp)

/** Every waiting suggestion approved as suggested, in one change. */
export const approveAllFrames = (frames: KeyframeData[], pending: Suggestion[]) =>
  pending.reduce((next, suggestion) => approveFrames(next, suggestion), frames)

export const removeFrame = (frames: KeyframeData[], timestamp: number) =>
  frames.filter((f) => f.timestamp !== timestamp)
