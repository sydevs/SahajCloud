import { MEDITATION } from './content-ids'
import { ID } from './ids'
import { fixture } from './types'

const cues = (lines: string[], stepMs = 4000) =>
  lines.map((content, i) => ({
    content,
    startTimeMs: i * stepMs,
    endTimeMs: (i + 1) * stepMs - 200,
  }))

export default fixture('transcripts', [
  // A finished run by the vendor.
  {
    id: 1_016_001,
    data: {
      source: { relationTo: 'meditations', value: ID.meditations.first },
      audioFilename: 'fixture-audio.mp3',
      provider: 'lemonfox',
      segments: cues([
        'Sit comfortably and close your eyes.',
        'Let your attention rest on the top of your head.',
        'Feel a gentle coolness there.',
        'There is nothing to do. Simply be.',
        'Take a moment of silence now.',
      ]),
      job: ID.payloadJobs.transcriptionCompleted,
    },
  },
  // Hand-made cues carried over from an earlier system.
  {
    id: 1_016_002,
    data: {
      source: { relationTo: 'meditations', value: ID.meditations.second },
      audioFilename: 'fixture-audio.mp3',
      provider: 'imported',
      segments: cues(
        ['Setzen Sie sich bequem hin.', 'Schliessen Sie die Augen.', 'Atmen Sie ruhig.'],
        6000,
      ),
    },
  },
  // A run that ended in error and left no cues, on a file rather than a meditation.
  {
    id: 1_016_003,
    data: {
      source: { relationTo: 'files', value: ID.files.audio },
      audioFilename: 'fixture-audio.mp3',
      provider: 'lemonfox',
      job: ID.payloadJobs.transcriptionFailed,
    },
  },
  // A row whose request never reached the queue: no job reads as failed.
  {
    id: 1_016_004,
    data: {
      source: { relationTo: 'meditations', value: MEDITATION.dailyEnglish },
      audioFilename: 'fixture-audio.mp3',
    },
  },
])
