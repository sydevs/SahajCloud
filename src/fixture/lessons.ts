import { LECTURE, MEDITATION } from './content-ids'
import { ID } from './ids'
import { block, doc, heading, paragraph } from './pages'
import { fixture, type FixtureData } from './types'

type Lesson = FixtureData<'lessons'>

const panels = (title: string): NonNullable<Lesson['panels']> => [
  { title, text: 'A short story panel that sets the scene for this step.', media: ID.files.image },
  { title: 'In practice', text: 'Try it for a few minutes before moving on.' },
]

const article = (title: string) =>
  doc(
    heading('h2', title),
    paragraph('A deeper look at the idea behind this step.'),
    block('quote', `lesson-quote-${title.length}`, {
      text: 'The practice is simple; the effect is subtle.',
      credit: 'Fixture Teacher',
    }),
  )

export default fixture('lessons', [
  // A step with a meditation, intro audio and a German translation of its own.
  {
    id: 1_020_001,
    data: {
      title: 'Settling in',
      unit: 'Unit 1',
      step: 1,
      icon: ID.images.square,
      panels: panels('Welcome'),
      meditation: { relationTo: 'meditations', value: MEDITATION.pathEnglish },
      preMeditationLines: 'find a quiet place\ntake a breath',
      introAudio: ID.files.audio,
      article: article('Settling in'),
    },
    locales: {
      de: {
        title: 'Ankommen',
        panels: [{ title: 'Willkommen', text: 'Eine kurze Geschichte zum Einstieg.' }],
        meditation: { relationTo: 'meditations', value: ID.meditations.second },
      },
    },
  },
  // Linked to a video rather than a meditation.
  {
    id: 1_020_002,
    data: {
      title: 'Feeling the breeze',
      unit: 'Unit 2',
      step: 1,
      icon: ID.images.logo,
      panels: panels('The breeze'),
      meditation: { relationTo: 'videos', value: ID.videos.first },
    },
    locales: { fr: { title: 'Sentir la brise' } },
  },
  // Linked to a lecture.
  {
    id: 1_020_003,
    data: {
      title: 'Hearing it said',
      unit: 'Unit 3',
      step: 1,
      icon: ID.images.portrait,
      panels: panels('A talk'),
      meditation: { relationTo: 'lectures', value: LECTURE.introduction },
      introAudio: ID.files.audio,
    },
  },
  {
    id: 1_020_004,
    data: {
      title: 'Hands and attention',
      unit: 'Unit 4',
      step: 1,
      icon: ID.images.landscape,
      panels: panels('Hands'),
      article: article('Hands and attention'),
    },
  },
  {
    id: 1_020_005,
    data: {
      title: 'Going further',
      unit: 'Unit 5',
      step: 1,
      icon: ID.images.square,
      panels: panels('Further'),
      meditation: { relationTo: 'meditations', value: MEDITATION.pathEnglish },
    },
  },
  // Only the fields every step needs.
  {
    id: 1_020_006,
    data: { title: 'A thin step', unit: 'Unit 6', step: 1, icon: ID.images.logo },
  },
  {
    id: 1_020_007,
    data: {
      title: 'Sharing the practice',
      unit: 'Unit 7',
      step: 2,
      icon: ID.images.portrait,
      panels: panels('Sharing'),
      article: article('Sharing the practice'),
    },
  },
])
