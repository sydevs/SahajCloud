/**
 * The derived transcript status, and the error beside it.
 *
 * Pure on purpose: a transcript carries no status column since #968 — the
 * retained job row is the one record of a run — so this is where the whole
 * mapping is pinned, rather than through a booted queue.
 */
import { describe, expect, it } from 'vitest'

import { deriveTranscriptStatus, transcriptJobError } from '@/collections/Transcripts/status'

describe('deriveTranscriptStatus', () => {
  it('reads completed off the stored cue count, whatever the job says', () => {
    // A run can finish having written nothing — its recording was replaced —
    // so the cues decide this one, not the job.
    expect(deriveTranscriptStatus(1, null)).toBe('completed')
    expect(deriveTranscriptStatus(12, { completedAt: null, hasError: true })).toBe('completed')
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

  it('treats a zero count as no transcript', () => {
    // `stampSegmentCount` writes 0 for a column holding nothing, and a run that
    // wrote no cue must not read as a finished transcript.
    expect(deriveTranscriptStatus(0, { completedAt: null, hasError: false })).toBe('processing')
  })

  it('reads a count the cues cannot give it as no transcript', () => {
    // The column is null on a row written before it existed, and a `select`
    // that drops it leaves `undefined`. Neither may read as completed — only
    // the migration's backfill makes the first case rare rather than wrong.
    expect(deriveTranscriptStatus(null, { completedAt: null, hasError: false })).toBe('processing')
    expect(deriveTranscriptStatus(undefined, { completedAt: null, hasError: false })).toBe(
      'processing',
    )
    // The cues themselves are not a count, so handing them over answers no.
    expect(
      deriveTranscriptStatus([{ content: 'Let the thoughts settle.' }], {
        completedAt: null,
        hasError: false,
      }),
    ).toBe('processing')
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

  /**
   * ⚠ `jobs.cancel` writes `{ cancelled: true }` and no message, so the row the
   * stale-job sweep ends is the one failure with nothing to read off it.
   */
  it('says a cancelled run was interrupted, which carries no message of its own', () => {
    expect(transcriptJobError({ error: { cancelled: true } })).toMatch(
      /interrupted before it finished/,
    )
  })

  it('answers null for no job, no error, and an error carrying no message', () => {
    expect(transcriptJobError(null)).toBeNull()
    expect(transcriptJobError({})).toBeNull()
    expect(transcriptJobError({ error: { cause: 'nothing readable' } })).toBeNull()
    expect(transcriptJobError({ error: { cancelled: false } })).toBeNull()
  })
})
