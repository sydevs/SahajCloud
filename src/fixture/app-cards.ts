import type { AppCard } from '@/payload-types'

import { at } from './at'
import { ALBUM, LECTURE, PAGE } from './content-ids'
import { ID } from './ids'
import { fixture, type FixtureData } from './types'

type View = NonNullable<AppCard['default']>
type Destination = NonNullable<View['destination']>

/** What a destination needs beside its name. */
const target = (destination: Destination): Partial<View> => {
  switch (destination) {
    case 'page':
      return { destination, page: PAGE.welcome }
    case 'lecture':
      return { destination, lecture: LECTURE.introduction }
    case 'album':
      return { destination, album: ALBUM.stillness }
    case 'meditation':
      return { destination, meditation: ID.meditations.first }
    case 'url':
      return { destination, url: 'https://example.invalid/fixture-card' }
  }
}

const view = (
  title: string,
  destination: Destination,
  look: Pick<View, 'alignment' | 'aspectRatio' | 'textColor'>,
  extra: Partial<View> = {},
): View => ({
  title,
  subtitle: 'Fixture subtitle',
  buttonText: 'Open',
  buttonIcon: ID.images.logo,
  image: ID.images.landscape,
  ...target(destination),
  ...look,
  ...extra,
})

const light = { aspectRatio: 'square', textColor: 'black', alignment: 'center' } as const
const dark = { aspectRatio: 'flexible', textColor: 'white', alignment: 'left' } as const

const eventView = (
  title: string,
  destination: Destination,
  look: Pick<View, 'alignment' | 'aspectRatio' | 'textColor'>,
  threshold: string,
) => ({ enabled: true, threshold, ...view(title, destination, look) })

type Card = FixtureData<'app-cards'>

const event = (
  label: string,
  schedule: NonNullable<Card['schedule']>,
  views: Pick<Card, 'default' | 'startingSoon' | 'liveNow'>,
  rest: Partial<Card> = {},
): Card => ({
  label,
  type: 'event',
  schedule,
  ...views,
  targetSections: ['hero'],
  audiences: [ID.audiences.first],
  ...rest,
})

export default fixture('app-cards', [
  {
    id: 1_021_001,
    data: {
      _status: 'published',
      label: 'Fixture welcome card',
      type: 'standard',
      default: view('Welcome to meditation', 'page', light, { header: 'New here?' }),
      targetSections: ['hero'],
      timings: ['morning'],
      audiences: [ID.audiences.first],
      weight: 5,
    },
    locales: { de: { _status: 'published', default: { title: 'Willkommen zur Meditation' } } },
  },
  {
    id: 1_021_002,
    data: {
      _status: 'published',
      label: 'Fixture lecture highlight',
      type: 'standard',
      default: view('An introduction', 'lecture', dark),
      targetSections: ['highlights', 'lectures'],
      timings: ['afternoon', 'evening'],
      audiences: [ID.audiences.first, ID.audiences.second],
      conditions: [ID.audiences.third],
      weight: 2,
    },
  },
  {
    id: 1_021_003,
    data: {
      _status: 'draft',
      label: 'Fixture album card (draft)',
      type: 'standard',
      default: view('New music', 'album', {
        aspectRatio: 'square',
        textColor: 'white',
        alignment: 'left',
      }),
      targetSections: ['lectures'],
      timings: ['night'],
      weight: 1,
    },
  },
  // Weekly on three days, with a scheduled break; live in English and German.
  {
    id: 1_021_004,
    data: {
      _status: 'published',
      ...event(
        'Fixture weekly live meditation',
        {
          firstDate: at({ days: 2, hour: 16 }),
          firstDate_tz: 'Europe/Berlin',
          endTime: '18:00',
          recurrenceType: 'WEEKLY',
          interval: 1,
          weekdays: ['MO', 'WE', 'FR'],
          exclusions: [
            { startDate: at({ days: 20 }), endDate: at({ days: 27 }), reason: 'Seasonal break' },
          ],
        },
        {
          default: view('Join us live', 'meditation', dark, { header: 'Live meditation' }),
          startingSoon: eventView('Starting at {{event_time}}', 'url', light, '1:00'),
          liveNow: eventView('Live now', 'page', dark, '0:00'),
        },
        { timings: ['evening', 'night'], weight: 4 },
      ),
    },
    locales: {
      de: {
        _status: 'published',
        default: { title: 'Meditieren Sie live mit uns' },
        startingSoon: { title: 'Beginnt um {{event_time}}' },
        liveNow: { title: 'Jetzt live' },
      },
    },
  },
  // Every day, with the live view switched off and a starting-soon view only.
  {
    id: 1_021_005,
    data: {
      _status: 'published',
      ...event(
        'Fixture daily sunrise session',
        {
          firstDate: at({ days: 1, hour: 6 }),
          firstDate_tz: 'America/New_York',
          recurrenceType: 'DAILY',
          interval: 1,
        },
        {
          default: view('Sunrise meditation', 'album', light),
          startingSoon: eventView('Sunrise in an hour', 'lecture', dark, '1:00'),
          liveNow: {
            enabled: false,
            threshold: '0:00',
            ...view('Sunrise, live', 'meditation', light),
          },
        },
        { targetSections: ['highlights'], timings: ['morning'], weight: 3 },
      ),
    },
  },
  // Monthly.
  {
    id: 1_021_006,
    data: {
      _status: 'published',
      ...event(
        'Fixture monthly gathering',
        {
          firstDate: at({ days: 10, hour: 19 }),
          firstDate_tz: 'Australia/Sydney',
          endTime: '20:30',
          recurrenceType: 'MONTHLY',
          interval: 1,
        },
        {
          default: view('Monthly gathering', 'url', dark),
          startingSoon: eventView('Gathering soon', 'album', light, '2:00'),
          liveNow: eventView('Gathering now', 'lecture', dark, '0:00'),
        },
        { targetSections: ['hero', 'highlights'], timings: ['afternoon'], weight: 5 },
      ),
    },
  },
  // A draft, on the remaining weekdays.
  {
    id: 1_021_007,
    data: {
      _status: 'draft',
      ...event(
        'Fixture weekend workshop (draft)',
        {
          firstDate: at({ days: 4, hour: 10 }),
          firstDate_tz: 'Europe/London',
          recurrenceType: 'WEEKLY',
          interval: 2,
          weekdays: ['TU', 'TH', 'SA', 'SU'],
        },
        {
          default: view('Weekend workshop', 'page', light),
          startingSoon: eventView('Workshop soon', 'page', dark, '1:00'),
          liveNow: eventView('Workshop live', 'url', light, '0:00'),
        },
        { weight: 1 },
      ),
    },
  },
  {
    id: 1_021_008,
    data: {
      _status: 'published',
      ...event(
        'Fixture one-off talk',
        { firstDate: at({ days: 6, hour: 15 }), firstDate_tz: 'Europe/London' },
        {
          default: view('A talk, once', 'lecture', dark),
          startingSoon: eventView('The talk starts soon', 'meditation', light, '1:00'),
          liveNow: eventView('The talk is on', 'album', dark, '0:00'),
        },
        { targetSections: ['lectures'], weight: 3 },
      ),
    },
  },
])
