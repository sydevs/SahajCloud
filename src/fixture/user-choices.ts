import { CHOICE, MEDITATION } from './content-ids'
import { ID } from './ids'
import { fixture } from './types'

// Parents come first: the file is written in order.
export default fixture('user-choices', [
  // A category: it has children, so it carries no timings of its own.
  {
    id: CHOICE.feelings,
    file: 'content-choice-mood.svg',
    data: {
      title: 'Feelings',
      slug: 'fixture-feelings',
      type: 'mood',
      color: '#6b8fd6',
      isFeatured: true,
      isParent: true,
      order: 1,
    },
  },
  {
    id: CHOICE.calm,
    file: 'content-choice-mood.svg',
    data: {
      title: 'Calm',
      slug: 'fixture-calm',
      type: 'mood',
      color: '#7bbf8e',
      parent: CHOICE.feelings,
      isFeatured: true,
      order: 1,
      timings: ['morning', 'afternoon', 'evening', 'night'],
      morningMeditation: ID.meditations.first,
      afternoonMeditation: MEDITATION.dailyEnglish,
      eveningMeditation: ID.meditations.first,
      nightMeditation: MEDITATION.dailyEnglish,
    },
    locales: {
      es: { title: 'Calma', morningMeditation: MEDITATION.dailySpanish },
    },
  },
  // Two more featured moods, each filled for one slot only, so a mood picker
  // reading this fixture shows a different tile for morning, afternoon and
  // evening.
  {
    id: CHOICE.grateful,
    file: 'content-choice-mood.svg',
    data: {
      title: 'Grateful',
      slug: 'fixture-grateful',
      type: 'mood',
      color: '#c98bb9',
      isFeatured: true,
      order: 1,
      timings: ['afternoon'],
      afternoonMeditation: MEDITATION.dailyEnglish,
    },
  },
  {
    id: CHOICE.restless,
    file: 'content-choice-mood.svg',
    data: {
      title: 'Restless',
      slug: 'fixture-restless',
      type: 'mood',
      color: '#d98b5f',
      isFeatured: true,
      order: 1,
      timings: ['evening'],
      eveningMeditation: ID.meditations.first,
    },
  },
  {
    id: CHOICE.energised,
    file: 'content-choice-mood.svg',
    data: {
      title: 'Energised',
      slug: 'fixture-energised',
      type: 'mood',
      color: '#e0a23c',
      parent: CHOICE.feelings,
      isFeatured: false,
      order: 2,
      timings: ['morning', 'afternoon'],
      morningMeditation: MEDITATION.dailyEnglish,
      afternoonMeditation: ID.meditations.first,
    },
  },
  {
    id: CHOICE.sleep,
    file: 'content-choice-mood.svg',
    data: {
      title: 'Ready for sleep',
      slug: 'fixture-ready-for-sleep',
      type: 'mood',
      color: '#3d4f7c',
      isFeatured: false,
      order: 3,
      timings: ['evening', 'night'],
      nightMeditation: MEDITATION.dailyEnglish,
    },
  },
  {
    id: CHOICE.deepen,
    file: 'content-choice-goal.svg',
    data: {
      title: 'Deepen my practice',
      slug: 'fixture-deepen-my-practice',
      type: 'goal',
      color: '#d6a86b',
      isFeatured: true,
      order: 1,
    },
  },
  {
    id: CHOICE.stress,
    file: 'content-choice-goal.svg',
    data: {
      title: 'Ease stress',
      slug: 'fixture-ease-stress',
      type: 'goal',
      color: '#c0675d',
      isFeatured: false,
      order: 2,
    },
  },
  {
    id: CHOICE.five,
    file: 'content-choice-duration.svg',
    data: {
      title: 'Five minutes',
      slug: 'fixture-five-minutes',
      type: 'duration',
      color: '#7bbf8e',
      isFeatured: true,
      order: 1,
    },
  },
  {
    id: CHOICE.ten,
    file: 'content-choice-duration.svg',
    data: {
      title: 'Ten minutes',
      slug: 'fixture-ten-minutes',
      type: 'duration',
      color: '#5da5a0',
      isFeatured: false,
      order: 2,
    },
  },
  {
    id: CHOICE.twenty,
    file: 'content-choice-duration.svg',
    data: {
      title: 'Twenty minutes',
      slug: 'fixture-twenty-minutes',
      type: 'duration',
      color: '#4f7fa8',
      isFeatured: false,
      order: 3,
    },
  },
])
