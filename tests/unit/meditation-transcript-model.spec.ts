/**
 * The Transcript tab's pure logic: which notice it shows, how phrases fall
 * into paragraphs and silences, and which phrase the playhead is in. The URL
 * it reads is pinned in `admin-locale-urls.spec.ts`, with its three siblings.
 *
 * Every cue time here is **milliseconds**, as `meditation-transcripts` stores
 * them; the playhead the preview reports is **seconds**.
 */
import { describe, expect, it } from 'vitest'

import { MeditationTranscripts } from '@/collections/MeditationTranscripts/MeditationTranscripts'
import { type JobStageConfig, readJobStageConfig } from '@/components/admin/JobStageView/stages'
import {
  activeSegmentIndex,
  groupTranscript,
  seekSecond,
  transcriptPhase,
} from '@/components/admin/MeditationTranscript/transcriptModel'
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

/**
 * The collection's own declaration, which is what the tab reads in the browser
 * — not a fixture restating it. A fixture here would assume the one thing these
 * cases exist to prove: that the tab's wait and the row's Edit view are read
 * off the same two values.
 */
const DECLARED = readJobStageConfig(MeditationTranscripts.admin?.custom)
const [FIRST_RUNNING] = DECLARED?.runningStages ?? []
const STALL_MS = DECLARED?.staleAfterMs

if (!DECLARED || !FIRST_RUNNING || STALL_MS === undefined) {
  throw new Error('meditation-transcripts must declare jobStage.runningStages and staleAfterMs')
}

const RUNNING = FIRST_RUNNING as MeditationTranscript['status']

const cue = (startTimeMs: number, endTimeMs: number): TranscriptSegment => ({
  content: `${startTimeMs}-${endTimeMs}`,
  startTimeMs,
  endTimeMs,
})

const NOW = Date.parse('2026-10-17T12:00:00.000Z')

const row = (
  overrides: Partial<Pick<MeditationTranscript, 'status' | 'updatedAt'>>,
): Pick<MeditationTranscript, 'status' | 'updatedAt'> => ({
  status: 'completed',
  updatedAt: new Date(NOW).toISOString(),
  ...overrides,
})

describe('transcriptPhase', () => {
  it('reads no row as nothing transcribed yet', () => {
    expect(transcriptPhase(DECLARED, undefined, NOW)).toBe('none')
  })

  it.each([
    [RUNNING, 'pending'],
    ['failed', 'failed'],
    ['completed', 'completed'],
  ] as const)('reads a fresh %s row as %s', (status, phase) => {
    expect(transcriptPhase(DECLARED, row({ status }), NOW)).toBe(phase)
  })

  it('reads a running row older than the declared stall bound as stalled', () => {
    const stale = new Date(NOW - STALL_MS - 1000).toISOString()

    expect(transcriptPhase(DECLARED, row({ status: RUNNING, updatedAt: stale }), NOW)).toBe(
      'stalled',
    )
  })

  it('leaves a running row inside the declared stall bound pending', () => {
    const recent = new Date(NOW - STALL_MS + 1000).toISOString()

    expect(transcriptPhase(DECLARED, row({ status: RUNNING, updatedAt: recent }), NOW)).toBe(
      'pending',
    )
  })

  it('does not stall a failed or completed row, however old', () => {
    const ancient = new Date(NOW - STALL_MS * 100).toISOString()

    expect(transcriptPhase(DECLARED, row({ status: 'failed', updatedAt: ancient }), NOW)).toBe(
      'failed',
    )
    expect(transcriptPhase(DECLARED, row({ status: 'completed', updatedAt: ancient }), NOW)).toBe(
      'completed',
    )
  })

  /**
   * The drift the seam exists to absorb, and the reason this file asserts
   * against a declaration rather than against `'processing'`: #912 added a
   * second `jobStage` whose running stage is spelled differently, so a tab
   * naming its own would wait while the row's Edit view did not — or fall
   * through to `completed` and render a blank tab.
   */
  describe('a stage the tab has never heard of', () => {
    const renamed: JobStageConfig = { runningStages: ['transcribing'], staleAfterMs: STALL_MS }
    const transcribing = row({ status: 'transcribing' as MeditationTranscript['status'] })

    it('is pending while it is fresh', () => {
      expect(transcriptPhase(renamed, transcribing, NOW)).toBe('pending')
    })

    it('is stalled once the bound passes', () => {
      const stale = { ...transcribing, updatedAt: new Date(NOW - STALL_MS - 1000).toISOString() }

      expect(transcriptPhase(renamed, stale, NOW)).toBe('stalled')
    })

    it('leaves the stage the declaration dropped reading completed', () => {
      expect(transcriptPhase(renamed, row({ status: RUNNING }), NOW)).toBe('completed')
    })
  })

  /** No declared bound is no bound: the wait keeps, as it does in `JobStageView`. */
  it('never stalls a running row where no staleAfterMs is declared', () => {
    const unbounded: JobStageConfig = { runningStages: [RUNNING as string] }
    const ancient = new Date(NOW - STALL_MS * 100).toISOString()

    expect(transcriptPhase(unbounded, row({ status: RUNNING, updatedAt: ancient }), NOW)).toBe(
      'pending',
    )
  })
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
