import { FRAME, MEDITATION } from './content-ids'
import { ID } from './ids'
import { fixture } from './types'

const AUDIO = 'fixture-audio.mp3'
/** Real MPEG frames stating no duration, as `songs` uses: the meditation that shows the warning. */
const AUDIO_NO_DURATION = 'fixture-audio-no-duration.mp3'

export default fixture('meditations', [
  // Published daily meditation in English.
  {
    id: ID.meditations.first,
    file: AUDIO,
    data: {
      _status: 'published',
      label: 'Fixture Morning Calm',
      locale: 'en',
      type: 'daily',
      narrator: ID.narrators.female,
      songTag: ID.songTags.first,
      thumbnail: ID.images.landscape,
      frames: [
        { id: FRAME.mooladhara, timestamp: 0 },
        { id: FRAME.anahat, timestamp: 10 },
        { id: FRAME.sahasrara, timestamp: 22 },
        { id: FRAME.namaste, timestamp: 36 },
      ],
    },
  },
  // A path meditation in German, the other `type`.
  {
    id: ID.meditations.second,
    file: AUDIO,
    data: {
      _status: 'published',
      label: 'Fixture Pfad Meditation',
      locale: 'de',
      type: 'lesson',
      narrator: ID.narrators.male,
      songTag: ID.songTags.second,
      thumbnail: ID.images.square,
      frames: [
        { id: FRAME.bandhan, timestamp: 0 },
        { id: FRAME.nabhi, timestamp: 8 },
        { id: FRAME.void, timestamp: 18 },
        { id: FRAME.agnya, timestamp: 30 },
      ],
    },
  },
  // A draft in French that has been through the whole workflow but never published.
  {
    id: ID.meditations.third,
    file: AUDIO,
    data: {
      _status: 'draft',
      label: 'Fixture Soir Apaisant',
      locale: 'fr',
      type: 'daily',
      narrator: ID.narrators.other,
      songTag: ID.songTags.third,
      thumbnail: ID.images.portrait,
      frames: [
        { id: FRAME.ida, timestamp: 0 },
        { id: FRAME.pingala, timestamp: 14 },
        { id: FRAME.sushumna, timestamp: 28 },
      ],
    },
  },
  {
    id: MEDITATION.dailySpanish,
    file: AUDIO,
    data: {
      _status: 'published',
      label: 'Fixture Meditación de la Tarde',
      locale: 'es',
      type: 'daily',
      narrator: ID.narrators.male,
      thumbnail: ID.images.landscape,
      frames: [
        { id: FRAME.risingVideo, timestamp: 0 },
        { id: FRAME.swadhistan, timestamp: 12 },
        { id: FRAME.vishuddhi, timestamp: 26 },
      ],
    },
  },
  {
    id: MEDITATION.pathEnglish,
    file: AUDIO,
    data: {
      _status: 'published',
      label: 'Fixture Path Step Meditation',
      locale: 'en',
      type: 'lesson',
      narrator: ID.narrators.female,
      thumbnail: ID.images.square,
      frames: [
        { id: FRAME.kundalini, timestamp: 0 },
        { id: FRAME.heartVideo, timestamp: 20 },
      ],
    },
  },
  // Audio just uploaded: the create screen's first save, before frames and a thumbnail exist.
  {
    id: MEDITATION.justUploaded,
    file: AUDIO,
    data: {
      _status: 'draft',
      label: 'Fixture Just Uploaded',
      locale: 'en',
      type: 'daily',
      narrator: ID.narrators.male,
    },
  },
  // Audio stating no length: the duration warning, and the empty
  // `subtleSystemNodeWeights` it explains. A draft, so no feed ranks it.
  {
    id: MEDITATION.noDuration,
    file: AUDIO_NO_DURATION,
    data: {
      _status: 'draft',
      label: 'Fixture Meditation (no duration)',
      locale: 'en',
      type: 'daily',
      narrator: ID.narrators.female,
      frames: [
        { id: FRAME.mooladhara, timestamp: 0 },
        { id: FRAME.sahasrara, timestamp: 12 },
      ],
    },
  },
  {
    id: MEDITATION.dailyEnglish,
    file: AUDIO,
    data: {
      _status: 'published',
      label: 'Fixture Afternoon Reset',
      locale: 'en',
      type: 'daily',
      narrator: ID.narrators.male,
      songTag: ID.songTags.first,
      thumbnail: ID.images.portrait,
      frames: [
        { id: FRAME.swadhistan, timestamp: 0 },
        { id: FRAME.nabhi, timestamp: 15 },
        { id: FRAME.anahat, timestamp: 33 },
      ],
    },
  },
])
