import { ID } from './ids'
import { MANAGER_IDS } from './managers'
import { REGION_IDS } from './regions'
import { fixture } from './types'

export const IMPORT_IDS = {
  completed: 1_024_001,
  failed: 1_024_002,
  review: 1_024_003,
  pending: 1_024_004,
} as const

// The job clears `rows` once it has run; the create parses them from the file, so a second write drops them.
const AFTER_RUN = { rows: null } as never

export default fixture('imports', [
  // ID.payloadJobs.importCompleted runs this one: every class is published.
  {
    id: IMPORT_IDS.completed,
    file: 'fixture-import-completed.csv',
    data: {
      status: 'completed',
      manager: ID.managers.regionManager,
      targetRegion: REGION_IDS.citySecond,
      defaultLanguages: ['en'],
      uploadLocale: 'en',
      results: [
        {
          row: 2,
          outcome: 'created',
          eventId: 1_025_013,
          title: 'Fixture Quay Street Sitting',
          city: 'Fixture Saltmere',
        },
        {
          row: 3,
          outcome: 'created',
          eventId: 1_025_014,
          title: 'Fixture Online Wind Down',
          city: 'Fixture Saltmere',
        },
      ],
    },
    locales: { en: AFTER_RUN },
  },
  // ID.payloadJobs.importFailed: no class was created.
  {
    id: IMPORT_IDS.failed,
    file: 'fixture-import-failed.csv',
    data: {
      status: 'failed',
      manager: ID.managers.admin,
      targetRegion: ID.regions.country,
      defaultLanguages: ['en', 'fr'],
      uploadLocale: 'en',
      error: 'The import stopped before it finished running. Upload the file again.',
      results: [
        {
          row: 2,
          outcome: 'error',
          title: 'Fixture Lost Row One',
          city: 'Fixture Nowhere',
          reasons: ['No city region matches "Fixture Nowhere".'],
          missingCity: { name: 'Fixture Nowhere' },
          values: {
            title: 'Fixture Lost Row One',
            city: 'Fixture Nowhere',
            address: '1 Void Lane',
          },
        },
        {
          row: 3,
          outcome: 'error',
          title: 'Fixture Lost Row Two',
          city: 'Fixture Nowhere',
          reasons: ['No city region matches "Fixture Nowhere".'],
          missingCity: { name: 'Fixture Nowhere' },
          values: {
            title: 'Fixture Lost Row Two',
            city: 'Fixture Nowhere',
            address: '2 Void Lane',
          },
        },
      ],
    },
    locales: { en: AFTER_RUN },
  },
  // Two classes are still drafts: the import waits in review.
  {
    id: IMPORT_IDS.review,
    file: 'fixture-import-review.csv',
    data: {
      status: 'review',
      manager: ID.managers.regionManager,
      targetRegion: ID.regions.city,
      defaultLanguages: ['en'],
      uploadLocale: 'en',
      results: [
        {
          row: 2,
          outcome: 'created',
          eventId: 1_025_010,
          title: 'Fixture Reed Lane Sitting',
          city: 'Fixture Harbourton',
        },
        {
          row: 3,
          outcome: 'created',
          eventId: 1_025_011,
          title: 'Fixture Mill Court Evening',
          city: 'Fixture Harbourton',
        },
        {
          row: 4,
          outcome: 'created',
          eventId: 1_025_012,
          title: 'Fixture Garden Morning',
          city: 'Fixture Harbourton',
        },
        {
          row: 5,
          outcome: 'duplicate',
          title: 'Fixture Lantern Hall Repeat',
          city: 'Fixture Harbourton',
          reasons: ['Repeats an existing class.'],
          duplicateOf: { eventId: 1_025_001, title: 'Fixture Thursday Evening Sitting' },
          values: {
            title: 'Fixture Lantern Hall Repeat',
            city: 'Fixture Harbourton',
            address: '14 Blossom Lane',
          },
        },
        {
          row: 6,
          outcome: 'error',
          title: 'Fixture Moonrise Circle',
          city: 'Fixture Driftwood',
          reasons: ['No city region matches "Fixture Driftwood".'],
          missingCity: { name: 'Fixture Driftwood' },
          values: {
            title: 'Fixture Moonrise Circle',
            city: 'Fixture Driftwood',
            address: '7 Dock Street',
          },
        },
        {
          row: 7,
          outcome: 'error',
          title: 'Fixture Bad Time',
          city: 'Fixture Harbourton',
          reasons: ['startTime: enter a time as HH:MM, 24-hour.'],
          values: { title: 'Fixture Bad Time', startTime: '25:00', endTime: '26:00' },
        },
      ],
    },
    locales: { en: AFTER_RUN },
  },
  // The file is read and its classes being created; nothing has been written back.
  {
    id: IMPORT_IDS.pending,
    file: 'fixture-import-pending.csv',
    data: {
      status: 'pending',
      manager: MANAGER_IDS.regionManagerNorth,
      targetRegion: ID.regions.city,
      defaultLanguages: ['en'],
      uploadLocale: 'en',
    },
  },
])
