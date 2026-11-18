import { ALBUM } from './content-ids'
import { ID } from './ids'
import { fixture } from './types'

const AUDIO = 'fixture-audio.mp3'
/** Clearly shorter than AUDIO, so two songs cannot share one duration by accident. */
const SHORT_AUDIO = 'fixture-audio-short.mp3'
/** Real MPEG frames stating no duration: the song that shows a blank one rather than a failed save. */
const NO_DURATION_AUDIO = 'fixture-audio-no-duration.mp3'

export default fixture('songs', [
  {
    id: 1_018_001,
    file: AUDIO,
    data: {
      title: 'Fixture Opening Breath',
      album: ALBUM.stillness,
      tags: [ID.songTags.first, ID.songTags.second],
      includeForMeditations: true,
    },
    locales: { de: { title: 'Erster Atemzug' } },
  },
  {
    id: 1_018_002,
    file: SHORT_AUDIO,
    data: {
      title: 'Fixture Held Note',
      album: ALBUM.stillness,
      tags: [ID.songTags.third],
      includeForMeditations: true,
    },
  },
  // Kept out of the random choice for meditations, as a vocal track would be.
  {
    id: 1_018_003,
    file: AUDIO,
    data: {
      title: 'Fixture Evening Chant',
      album: ALBUM.evening,
      tags: [ID.songTags.second],
      includeForMeditations: false,
    },
  },
  {
    id: 1_018_004,
    file: AUDIO,
    data: {
      title: 'Fixture Sunrise',
      album: ALBUM.morning,
      tags: [ID.songTags.first, ID.songTags.third],
      includeForMeditations: true,
    },
  },
  // No tags at all, and audio nothing can read a duration from.
  {
    id: 1_018_005,
    file: NO_DURATION_AUDIO,
    data: {
      title: 'Fixture Damaged Interlude (no duration)',
      album: ALBUM.morning,
      includeForMeditations: true,
    },
  },
])
