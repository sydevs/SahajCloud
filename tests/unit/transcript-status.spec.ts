/**
 * The derived transcript status, and the error beside it.
 *
 * Pure on purpose: a transcript carries no status column since #968 — the
 * retained job row is the one record of a run — so this is where the whole
 * mapping is pinned, rather than through a booted queue.
 */
import { describe, expect, it } from 'vitest'

import {
  deriveTranscriptStatus,
  transcriptJobError,
} from '@/collections/MeditationTranscripts/status'

const cues = [{ text: 'Let the thoughts settle.', start: 0, end: 1000 }]

describe('deriveTranscriptStatus', () => {
  it('reads completed off the cues, whatever the job says', () => {
    // A run can finish having written nothing — its recording was replaced —
    // so the cues decide this one, not the job.
    expect(deriveTranscriptStatus(cues, null)).toBe('completed')
    expect(deriveTranscriptStatus(cues, { completedAt: null, hasError: true })).toBe('completed')
  })

  it('calls a row with no job failed', () => {
    // The row is created by the save that adds a recording and the queue write
    // follows it, so no job means that write never landed.
    expect(deriveTranscriptStatus(null, null)).toBe('failed')
  })

  it('calls an errored run failed', () => {
    expect(deriveTranscriptStatus(null, { completedAt: null, hasError: true })).toBe('failed')
  })

  it('calls a finished run that wrote no cues failed', () => {
    expect(
      deriveTranscriptStatus(null, { completedAt: '2026-10-17T00:00:00.000Z', hasError: false }),
    ).toBe('failed')
  })

  it('calls an unfinished run processing', () => {
    expect(deriveTranscriptStatus(null, { completedAt: null, hasError: false })).toBe('processing')
    expect(deriveTranscriptStatus(null, {})).toBe('processing')
  })

  it('treats an empty cue array as no transcript', () => {
    // The column is null until a run writes it, but a normaliser that ever
    // answered `[]` must not read as a finished transcript.
    expect(deriveTranscriptStatus([], { completedAt: null, hasError: false })).toBe('processing')
  })
})

describe('transcriptJobError', () => {
  it('reads the message out of the job error object', () => {
    expect(transcriptJobError({ error: { message: 'Lemonfox refused the recording.' } })).toBe(
      'Lemonfox refused the recording.',
    )
  })

  it('takes a bare string as the message', () => {
    expect(transcriptJobError({ error: 'No timestamped speech.' })).toBe('No timestamped speech.')
  })

  it('answers null for no job, no error, and an error carrying no message', () => {
    expect(transcriptJobError(null)).toBeNull()
    expect(transcriptJobError({})).toBeNull()
    expect(transcriptJobError({ error: { cause: 'nothing readable' } })).toBeNull()
  })
})
