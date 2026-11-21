import { CHOICE, LECTURE, NODE } from './content-ids'
import { ID } from './ids'
import { fixture, type FixtureData } from './types'

// A full lecture's metadata is what the Nirmala Vidya fetch would have filled.
// Its title is where NV states the day of the talk, which `date` mirrors.
const metadata = (
  n: number,
  title: string,
  duration: number,
): FixtureData<'lectures'>['metadata'] => ({
  title,
  thumbnailUrl: `https://example.invalid/fixture-lecture-${n}.jpg`,
  hlsUrl: `https://example.invalid/fixture-lecture-${n}/manifest.m3u8`,
  subtitles: {
    en: `https://example.invalid/fixture-lecture-${n}/en.vtt`,
    de: `https://example.invalid/fixture-lecture-${n}/de.vtt`,
  },
  duration,
  lastSyncedAt: '2026-11-01T09:00:00.000Z',
})

// Parents come first: the file is written in order.
export default fixture('lectures', [
  {
    id: LECTURE.introduction,
    data: {
      type: 'full',
      nirmalVidyaVimeoUrl: 'https://vimeo.com/990000001',
      title: 'An introduction to meditation',
      // Derived from the NV title below, as a synced row's is.
      date: '1979-03-18T12:00:00.000Z',
      metadata: metadata(1, 'An introduction to meditation (1979-03-18)', 1820),
      audiences: [ID.audiences.first, ID.audiences.second],
      userChoices: [CHOICE.calm, CHOICE.deepen],
      subtleSystemNodes: [NODE.anahat, NODE.sahasrara],
      priority: 10,
    },
    locales: { de: { title: 'Eine Einführung in die Meditation' } },
  },
  {
    id: LECTURE.energy,
    data: {
      type: 'full',
      nirmalVidyaVimeoUrl: 'https://vimeo.com/990000002',
      title: 'The energy within',
      date: '1983-07-02T12:00:00.000Z',
      thumbnail: ID.images.landscape,
      metadata: metadata(2, 'The energy within (1983-07-02)', 2410),
      audiences: [ID.audiences.first],
      userChoices: [CHOICE.energised],
      subtleSystemNodes: [NODE.kundalini, NODE.ida, NODE.pingala, NODE.sushumna],
      priority: 0,
    },
  },
  // No audience, so it appears only where something names it. Its NV title
  // states no date, so the column is empty — the one production row in that
  // state is an upstream typo.
  {
    id: LECTURE.forgiveness,
    data: {
      type: 'full',
      nirmalVidyaVimeoUrl: 'https://vimeo.com/990000003',
      title: 'On forgiveness',
      metadata: metadata(3, 'On forgiveness', 1500),
      subtleSystemNodes: [NODE.agnya],
    },
  },
  // Clips excerpt a full lecture, and may carry subtitle overrides.
  {
    id: LECTURE.introductionClip,
    data: {
      type: 'clip',
      fullLecture: LECTURE.introduction,
      title: 'What is stillness?',
      startTime: 120,
      stopTime: 300,
      subtitles: [
        { locale: 'de', url: 'https://example.invalid/fixture-clip-1/de.vtt' },
        { locale: 'fr', url: 'https://example.invalid/fixture-clip-1/fr.vtt' },
      ],
      audiences: [ID.audiences.first],
      userChoices: [CHOICE.calm],
      subtleSystemNodes: [NODE.sahasrara],
      priority: 50,
    },
  },
  {
    id: LECTURE.energyClip,
    data: {
      type: 'clip',
      fullLecture: LECTURE.energy,
      title: 'The three channels',
      thumbnail: ID.images.square,
      startTime: 600,
      audiences: [ID.audiences.third],
      subtleSystemNodes: [NODE.ida, NODE.pingala],
    },
  },
])
