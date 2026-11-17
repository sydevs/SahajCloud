import { at } from './at'
import { ID } from './ids'
import { fixture } from './types'

const AUDIO = 'fixture-audio.mp3'

// Terminal rows only: a queued job would run, and a `processing` one would be cancelled by the hourly sweep.
export default fixture('payload-jobs', [
  {
    id: ID.payloadJobs.transcriptionCompleted,
    data: {
      taskSlug: 'transcribeMeditation',
      queue: 'default',
      input: { fileId: ID.files.audio, audioFilename: AUDIO },
      processing: false,
      hasError: false,
      totalTried: 1,
      completedAt: at({ days: -1, hour: 9, minute: 4 }),
      log: [
        {
          id: 'fixture-log-1',
          taskID: 'fixture-task-1',
          taskSlug: 'transcribeMeditation',
          executedAt: at({ days: -1, hour: 9, minute: 2 }),
          completedAt: at({ days: -1, hour: 9, minute: 4 }),
          state: 'succeeded',
          input: { fileId: ID.files.audio, audioFilename: AUDIO },
          output: { status: 'completed' },
        },
      ],
    },
  },
  {
    id: ID.payloadJobs.transcriptionFailed,
    data: {
      taskSlug: 'transcribeMeditation',
      queue: 'default',
      input: { fileId: 1_005_010, audioFilename: AUDIO },
      processing: false,
      hasError: true,
      totalTried: 1,
      completedAt: at({ days: -1, hour: 10, minute: 31 }),
      error: { message: 'Lemonfox could not fetch the recording.' },
      log: [
        {
          id: 'fixture-log-2',
          taskID: 'fixture-task-2',
          taskSlug: 'transcribeMeditation',
          executedAt: at({ days: -1, hour: 10, minute: 30 }),
          completedAt: at({ days: -1, hour: 10, minute: 31 }),
          state: 'failed',
          input: { fileId: 1_005_010, audioFilename: AUDIO },
          error: { message: 'Lemonfox could not fetch the recording.' },
        },
      ],
    },
  },
  {
    id: ID.payloadJobs.importCompleted,
    data: {
      taskSlug: 'importEvents',
      queue: 'default',
      input: { importId: 1_024_001 },
      processing: false,
      hasError: false,
      totalTried: 1,
      completedAt: at({ days: -2, hour: 14, minute: 6 }),
      log: [
        {
          id: 'fixture-log-3',
          taskID: 'fixture-task-3',
          taskSlug: 'importEvents',
          executedAt: at({ days: -2, hour: 14, minute: 5 }),
          completedAt: at({ days: -2, hour: 14, minute: 6 }),
          state: 'succeeded',
          input: { importId: 1_024_001 },
          output: { status: 'completed' },
        },
      ],
    },
  },
  {
    id: ID.payloadJobs.importFailed,
    data: {
      taskSlug: 'importEvents',
      queue: 'default',
      input: { importId: 1_024_002 },
      processing: false,
      hasError: true,
      totalTried: 1,
      completedAt: at({ days: -2, hour: 16, minute: 21 }),
      error: { message: 'The import stopped before every class was read.' },
      log: [
        {
          id: 'fixture-log-4',
          taskID: 'fixture-task-4',
          taskSlug: 'importEvents',
          executedAt: at({ days: -2, hour: 16, minute: 20 }),
          completedAt: at({ days: -2, hour: 16, minute: 21 }),
          state: 'failed',
          input: { importId: 1_024_002 },
          error: { message: 'The import stopped before every class was read.' },
        },
      ],
    },
  },
  // An unrelated nightly run, as a job list shows beside the two kinds above.
  {
    id: 1_027_010,
    data: {
      taskSlug: 'cleanupCollections',
      queue: 'nightly',
      processing: false,
      hasError: false,
      totalTried: 1,
      completedAt: at({ days: 0, hour: 0, minute: 1 }),
      log: [
        {
          id: 'fixture-log-5',
          taskID: 'fixture-task-5',
          taskSlug: 'cleanupCollections',
          executedAt: at({ days: 0, hour: 0, minute: 0 }),
          completedAt: at({ days: 0, hour: 0, minute: 1 }),
          state: 'succeeded',
        },
      ],
    },
  },
])
