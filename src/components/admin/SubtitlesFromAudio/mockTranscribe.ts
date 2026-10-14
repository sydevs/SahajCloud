import type { Subtitles } from '@/lib/utilities/subtitles'

/**
 * PROTOTYPE ONLY — replaced by the real transcription request, which sends the
 * recording to Lemonfox and splits the result into short lines. It answers
 * with the shape that request must return, after a realistic delay, so the UI
 * can be reviewed without a Lemonfox key.
 *
 * `?mockState=<state>` opens the field in one state, for reviewers and
 * screenshots: `making`, `failed` or `audio-changed`. `made` runs the fake
 * transcription as soon as the page opens, and shows its result 3.5 s later.
 */
export type MockState = 'audio-changed' | 'failed' | 'made' | 'making'

const STATES: MockState[] = ['making', 'made', 'failed', 'audio-changed']

export const MOCK_ERROR = 'Lemonfox did not respond in time. Try again in a minute.'

export function mockState(): MockState | null {
  const value = new URLSearchParams(window.location.search).get('mockState')
  return STATES.includes(value as MockState) ? (value as MockState) : null
}

export async function mockTranscribe(_fileId: number | string): Promise<Subtitles> {
  await new Promise((resolve) => setTimeout(resolve, 3500))
  if (mockState() === 'failed') throw new Error(MOCK_ERROR)
  return mockSubtitles()
}

/** The first lines of step 17's real intro, as the request would return them. */
function mockSubtitles(): Subtitles {
  return SAMPLE.map(([startTimeMs, endTimeMs, content]) => ({
    content,
    startTimeMs,
    endTimeMs,
    durationMs: endTimeMs - startTimeMs,
  }))
}

const SAMPLE: [number, number, string][] = [
  [600, 1800, "In this module, we're"],
  [1800, 2980, 'learning about the power'],
  [2980, 4609, 'of the relationship between'],
  [4609, 6050, 'our Kundalini and the all'],
  [6050, 8370, 'pervading power around us.'],
  [8370, 9880, 'When the two become connected'],
  [9880, 11720, 'through meditation, our pure'],
  [11720, 13310, 'desires can be manifested'],
  [13310, 15129, 'before our very eyes,'],
  [15129, 16360, 'without us needing to have'],
  [16360, 18930, 'to plan or be in control.'],
  [18930, 19990, "It's a phenomenon which"],
  [19990, 21060, 'you can experiment with'],
  [21060, 22360, 'in everyday life, and'],
]
