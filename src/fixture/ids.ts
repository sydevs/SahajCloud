/**
 * The fixture ids one collection's file names in another's.
 *
 * Every collection owns a block of a thousand ids, `1_0NN_000`–`1_0NN_999`
 * (table in `./AGENTS.md`), so an id alone says which collection it is in. A
 * file writes its other ids as literals inside its own block; only an id another
 * file points at is named here. The owning file must define a row for each.
 */
export const ID = {
  managers: {
    admin: 1_001_001,
    regionManager: 1_001_002,
    eventManager: 1_001_003,
    inactive: 1_001_004,
    contentEditor: 1_001_005,
  },
  regions: {
    country: 1_002_001,
    city: 1_002_002,
    venue: 1_002_003,
  },
  users: {
    amara: 1_003_001,
    bruno: 1_003_002,
    chen: 1_003_003,
  },
  images: {
    landscape: 1_004_001,
    portrait: 1_004_002,
    square: 1_004_003,
    logo: 1_004_004,
  },
  files: {
    pdf: 1_005_001,
    audio: 1_005_002,
    image: 1_005_003,
  },
  narrators: {
    female: 1_006_001,
    male: 1_006_002,
    other: 1_006_003,
  },
  authors: {
    first: 1_007_001,
    second: 1_007_002,
    third: 1_007_003,
  },
  audiences: {
    first: 1_008_001,
    second: 1_008_002,
    third: 1_008_003,
  },
  songTags: {
    first: 1_009_001,
    second: 1_009_002,
    third: 1_009_003,
  },
  videos: {
    first: 1_013_001,
    second: 1_013_002,
    third: 1_013_003,
  },
  meditations: {
    first: 1_015_001,
    second: 1_015_002,
    third: 1_015_003,
  },
  clients: {
    first: 1_022_001,
    second: 1_022_002,
    third: 1_022_003,
  },
  payloadJobs: {
    transcriptionCompleted: 1_027_001,
    transcriptionFailed: 1_027_002,
    importCompleted: 1_027_003,
    importFailed: 1_027_004,
  },
} as const
