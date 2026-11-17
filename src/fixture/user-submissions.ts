import { at } from './at'
import { EVENT_IDS } from './events'
import { FORM_IDS } from './forms'
import { ID } from './ids'
import { MANAGER_IDS } from './managers'
import { REGION_IDS } from './regions'
import { fixture, type FixtureEntry } from './types'
import { USER_IDS } from './users'

const TZ = 'Europe/London' as const

type Submission = FixtureEntry<'user-submissions'>['data']

const answers = (...pairs: [string, string][]) => pairs.map(([field, value]) => ({ field, value }))

const screened = (
  verdict: 'content_rejected' | 'disposable_email' | 'ok' | 'repeat_sender',
  days: number,
  notes?: string[],
) => ({ verdict, ...(notes ? { notes } : {}), screenedAt: at({ days, hour: 6 }) })

const registration = (
  id: number,
  uuid: string,
  event: number,
  user: number,
  status: NonNullable<Submission['status']>,
  extra: Submission = {},
): FixtureEntry<'user-submissions'> => ({
  id,
  data: {
    type: 'registration',
    uuid,
    event,
    user,
    status,
    startingAt: at({ days: 3, hour: 18, minute: 30 }),
    startingAt_tz: TZ,
    submissionData: answers(['experience', 'A few months of practice.']),
    ...extra,
  },
})

export default fixture('user-submissions', [
  // Registrations on the Thursday sitting, in every state a signup reaches.
  registration(1_026_001, 'fixture-reg-001', EVENT_IDS.thursday, ID.users.amara, 'accepted', {
    submissionData: answers(
      ['name', 'Amara'],
      ['experience', 'First time.'],
      ['referral', 'A friend told me.'],
      ['subscribe', 'true'],
    ),
    screeningResult: screened('ok', -2),
  }),
  registration(1_026_002, 'fixture-reg-002', EVENT_IDS.thursday, ID.users.bruno, 'accepted', {
    startingAt: at({ days: -4, hour: 18, minute: 30 }),
    followUpSentAt: at({ days: -3, hour: 9 }),
  }),
  registration(1_026_003, 'fixture-reg-003', EVENT_IDS.thursday, ID.users.chen, 'pending'),
  registration(1_026_004, 'fixture-reg-004', EVENT_IDS.thursday, USER_IDS.dara, 'rejected'),
  registration(1_026_005, 'fixture-reg-005', EVENT_IDS.thursday, USER_IDS.emeka, 'spam', {
    screeningResult: screened('disposable_email', -1, [
      'The address is on a disposable-mail list, so this signup was set aside.',
    ]),
    activityLog: [
      {
        at: at({ days: -1, hour: 6 }),
        type: 'screening',
        cells: { activity: { text: 'Refused by screening', sub: 'Disposable email address' } },
      },
    ],
  }),
  registration(1_026_006, 'fixture-reg-006', EVENT_IDS.thursday, USER_IDS.fiora, 'confirmed_spam', {
    screeningResult: screened('repeat_sender', -30, ['Sent the same answers to many classes.']),
  }),
  // The online class sits at its limit of two; the third attempt failed to deliver.
  registration(1_026_007, 'fixture-reg-007', EVENT_IDS.onlineDaily, ID.users.amara, 'accepted', {
    startingAt: at({ days: 1, hour: 7 }),
  }),
  registration(1_026_008, 'fixture-reg-008', EVENT_IDS.onlineDaily, ID.users.bruno, 'accepted', {
    startingAt: at({ days: 1, hour: 7 }),
  }),
  registration(1_026_009, 'fixture-reg-009', EVENT_IDS.onlineDaily, ID.users.chen, 'failed', {
    startingAt: at({ days: 1, hour: 7 }),
  }),
  // Votes on the unverified listing: three confirm it and one denies it.
  registration(1_026_010, 'fixture-reg-010', EVENT_IDS.unverified, ID.users.amara, 'accepted', {
    eventFeedback: 'confirmed',
    startingAt: at({ days: -7, hour: 18 }),
  }),
  registration(1_026_011, 'fixture-reg-011', EVENT_IDS.unverified, ID.users.bruno, 'accepted', {
    eventFeedback: 'confirmed',
    startingAt: at({ days: -7, hour: 18 }),
  }),
  registration(1_026_012, 'fixture-reg-012', EVENT_IDS.unverified, ID.users.chen, 'accepted', {
    eventFeedback: 'confirmed',
    startingAt: at({ days: -7, hour: 18 }),
  }),
  registration(1_026_013, 'fixture-reg-013', EVENT_IDS.unverified, USER_IDS.dara, 'accepted', {
    eventFeedback: 'denied',
    startingAt: at({ days: -7, hour: 18 }),
  }),

  // Contact messages through each status a message can reach.
  {
    id: 1_026_020,
    data: {
      type: 'contact',
      uuid: 'fixture-contact-001',
      form: FORM_IDS.contact,
      user: ID.users.chen,
      status: 'pending',
      submissionData: answers(
        ['subject', 'Beginners?'],
        ['message', 'Is the Thursday sitting suitable for a complete beginner?'],
      ),
    },
  },
  {
    id: 1_026_021,
    data: {
      type: 'contact',
      uuid: 'fixture-contact-002',
      form: FORM_IDS.contact,
      user: USER_IDS.dara,
      status: 'accepted',
      screeningResult: screened('ok', -2),
      submissionData: answers(['message', 'Thank you for last week. Where can I find more?']),
      activityLog: [
        {
          at: at({ days: -2, hour: 7 }),
          type: 'delivery',
          cells: {
            activity: 'Message delivered',
            sentTo: { label: 'Email', text: 'rafael.quintero@fixture.invalid' },
          },
        },
      ],
    },
  },
  {
    id: 1_026_022,
    data: {
      type: 'contact',
      uuid: 'fixture-contact-003',
      form: FORM_IDS.contactDefault,
      user: USER_IDS.emeka,
      status: 'rejected',
      submissionData: answers(['message', 'Could you run a class in my office?']),
    },
  },
  {
    id: 1_026_023,
    data: {
      type: 'contact',
      uuid: 'fixture-contact-004',
      form: FORM_IDS.contactDefault,
      user: USER_IDS.gustavo,
      status: 'spam',
      screeningResult: screened('content_rejected', -3, ['The message looked like an advert.']),
      submissionData: answers([
        'message',
        'Boost your ranking fast, reply for an unbeatable offer.',
      ]),
    },
  },
  {
    id: 1_026_024,
    data: {
      type: 'contact',
      uuid: 'fixture-contact-005',
      form: FORM_IDS.contact,
      user: USER_IDS.fiora,
      status: 'failed',
      submissionData: answers(['message', 'Please add me to the Harbourton list.']),
      activityLog: [
        {
          at: at({ days: -1, hour: 8 }),
          type: 'delivery',
          cells: { activity: { text: 'Delivery failed', sub: 'The recipient address bounced.' } },
        },
      ],
    },
  },

  // Subscriptions: from a form, and spawned by a registration's opt-in.
  {
    id: 1_026_030,
    data: {
      type: 'subscribe',
      uuid: 'fixture-subscribe-001',
      form: FORM_IDS.subscribe,
      client: ID.clients.first,
      user: ID.users.amara,
      status: 'accepted',
      submissionData: answers(['name', 'Amara']),
    },
  },
  {
    id: 1_026_031,
    data: {
      type: 'subscribe',
      uuid: 'fixture-subscribe-002',
      form: FORM_IDS.subscribe,
      client: ID.clients.first,
      user: USER_IDS.dara,
      status: 'pending',
      unsubscribedAt: at({ days: -1, hour: 10 }),
    },
  },
  {
    id: 1_026_032,
    data: {
      type: 'subscribe',
      uuid: 'fixture-subscribe-003',
      event: EVENT_IDS.thursday,
      client: ID.clients.second,
      user: ID.users.amara,
      status: 'accepted',
    },
  },

  // Proposals: a new event awaiting review, a change that was accepted, a refusal, and one with a reviewer named.
  {
    id: 1_026_040,
    data: {
      type: 'proposal',
      uuid: 'fixture-proposal-001',
      user: USER_IDS.emeka,
      status: 'pending',
      region: ID.regions.city,
      routingRegion: ID.regions.city,
      location: { placeId: 'place-fixtureharbourton', countryId: 'country-fixturevasanta' },
      submissionData: answers(['note', 'We meet in a community hall most evenings.']),
      proposed: {
        title: 'Fixture Riverside Evening Sit',
        languages: ['en'],
        eventType: 'offline',
        address: {
          street: '40 Riverside Walk',
          postCode: 'FX1 9RW',
          country: 'GB',
          city: 'Fixture Harbourton',
          latitude: 51.508,
          longitude: -0.13,
        },
        schedule: {
          firstDate: at({ days: 8, hour: 19 }),
          firstDate_tz: TZ,
          recurrenceType: 'WEEKLY',
          interval: 1,
          weekdays: ['WE'],
        },
      },
    },
  },
  {
    id: 1_026_041,
    data: {
      type: 'proposal',
      uuid: 'fixture-proposal-002',
      event: EVENT_IDS.thursday,
      user: ID.users.bruno,
      status: 'accepted',
      submissionData: answers(['note', 'The class now ends half an hour later.']),
      proposed: { schedule: { endTime: '20:30' }, contactPhone: '+000 555 0142' },
    },
  },
  {
    id: 1_026_042,
    data: {
      type: 'proposal',
      uuid: 'fixture-proposal-003',
      user: USER_IDS.fiora,
      status: 'rejected',
      region: REGION_IDS.citySecond,
      routingRegion: REGION_IDS.citySecond,
      submissionData: answers(['note', 'An existing class under a new name.']),
      proposed: {
        title: 'Fixture Saltmere Duplicate Proposal',
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.invalid/rooms/fixture-proposed',
      },
    },
  },
  {
    id: 1_026_043,
    data: {
      type: 'proposal',
      uuid: 'fixture-proposal-004',
      user: ID.users.chen,
      status: 'pending',
      manager: MANAGER_IDS.regionManagerNorth,
      region: REGION_IDS.citySecond,
      routingRegion: REGION_IDS.region,
      location: { regionId: 'region-fixturenorthmarch' },
      submissionData: answers(['note', 'Please assign me as the class manager.']),
      proposed: {
        title: 'Fixture Saltmere Harbour Sit',
        languages: ['en'],
        eventType: 'offline',
        address: {
          street: '2 Harbour Wall',
          country: 'GB',
          city: 'Fixture Saltmere',
          latitude: 51.202,
          longitude: 0.304,
        },
      },
    },
  },
])
