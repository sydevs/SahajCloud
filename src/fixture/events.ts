import { toLogRow } from '@/fields'
import { buildReminderEntry, buildVerificationEntry } from '@/lib/eventVerification/log'
import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'

import { at } from './at'
import { ID } from './ids'
import { IMPORT_IDS } from './imports'
import { MANAGER_IDS } from './managers'
import { REGION_IDS } from './regions'
import { fixture } from './types'

export const EVENT_IDS = {
  thursday: 1_025_001,
  onlineDaily: 1_025_002,
  reminded: 1_025_003,
  escalated: 1_025_004,
  urgent: 1_025_005,
  expired: 1_025_006,
  finished: 1_025_007,
  unverified: 1_025_008,
  denied: 1_025_009,
} as const

const TZ = 'Europe/London' as const

// `LexicalValue` is an interface, which the generated rich-text type's index signature refuses.
const rich = (text: string) => plainTextToLexical(text) as never

type Actor = { id: number; name: string }

const tamsin: Actor = { id: ID.managers.eventManager, name: 'Tamsin Okafor-Reyes' }
const rafael: Actor = { id: ID.managers.regionManager, name: 'Rafael Quintero' }

const verification = (
  method: 'email-link' | 're-save' | 'verify-action',
  by: Actor,
  days: number,
) => toLogRow(buildVerificationEntry(method, by, at({ days, hour: 10 })))

const reminder = (
  stage: 'verified' | 'reminded' | 'escalated',
  level: 'due' | 'escalated' | 'urgent',
  role: 'manager' | 'region',
  to: Actor,
  days: number,
) =>
  toLogRow(
    buildReminderEntry({
      stage,
      level,
      role,
      ...(role === 'region' ? { region: 'Fixture Harbourton' } : {}),
      manager: to,
      channel: 'email',
      destination: 'tamsin.okaforreyes@fixture.invalid',
      at: at({ days, hour: 4 }),
    }),
  )

const address = (
  venueName: string | null,
  street: string,
  city: string,
  latitude: number,
  longitude: number,
  postCode: string,
) => ({
  venueName,
  street,
  postCode,
  country: 'GB',
  region: 'Fixture Vasanta',
  city,
  latitude,
  longitude,
})

export default fixture('events', [
  // Weekly, offline, published, verified: the ordinary listing, with signups, a break and a log.
  {
    id: EVENT_IDS.thursday,
    data: {
      _status: 'published',
      title: 'Fixture Thursday Evening Sitting',
      languages: ['en'],
      description: rich('A relaxed weekly sitting for beginners and regulars alike.'),
      website: 'https://example.invalid/lantern',
      contactName: 'Tamsin',
      contactEmail: 'tamsin.contact@fixture.invalid',
      contactPhone: '+000 555 0142',
      images: [ID.images.landscape, ID.images.square],
      submitter: ID.users.amara,
      region: ID.regions.venue,
      eventType: 'offline',
      address: address(
        'Fixture Lantern Hall',
        '14 Blossom Lane',
        'Fixture Harbourton',
        51.5105,
        -0.1301,
        'FX1 5GH',
      ),
      schedule: {
        firstDate: at({ days: -60, hour: 18, minute: 30 }),
        firstDate_tz: TZ,
        endTime: '20:30',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['TH'],
        exclusions: [
          {
            startDate: at({ days: 14 }),
            endDate: at({ days: 21 }),
            reason: 'Fixture winter break',
          },
        ],
      },
      registrationMode: 'sahaj-atlas',
      registrationLimit: 12,
      registrationQuestions: { experience: true, referral: true },
      manager: ID.managers.eventManager,
      verificationStage: 'verified',
      nextCheckAt: at({ days: 24, hour: 4 }),
      activityLog: [verification('verify-action', tamsin, -6)],
    },
  },
  // Online, daily, ends after a count; full at its limit of two.
  {
    id: EVENT_IDS.onlineDaily,
    data: {
      _status: 'published',
      title: 'Fixture Morning Sit Online',
      languages: ['en', 'es'],
      description: rich('Half an hour of guided stillness before the day starts.'),
      region: ID.regions.city,
      eventType: 'online',
      onlineUrl: 'https://example.invalid/rooms/fixture-morning',
      schedule: {
        firstDate: at({ days: -10, hour: 7 }),
        firstDate_tz: TZ,
        endTime: '07:30',
        recurrenceType: 'DAILY',
        interval: 1,
        endingType: 'count',
        count: 30,
      },
      registrationMode: 'sahaj-atlas',
      registrationLimit: 2,
      manager: ID.managers.regionManager,
      verificationStage: 'verified',
      nextCheckAt: at({ days: 20, hour: 4 }),
      activityLog: [verification('re-save', rafael, -10)],
    },
  },
  // Monthly by date, ending on a date; first reminder sent.
  {
    id: EVENT_IDS.reminded,
    data: {
      _status: 'published',
      title: 'Fixture Monthly Garden Gathering',
      languages: ['en'],
      description: rich('A monthly sitting in the garden room.'),
      region: REGION_IDS.citySecond,
      eventType: 'offline',
      address: address(null, '8 Saltmere Green', 'Fixture Saltmere', 51.2, 0.3, 'FX2 4DD'),
      schedule: {
        firstDate: at({ days: -100, hour: 19 }),
        firstDate_tz: TZ,
        recurrenceType: 'MONTHLY',
        interval: 1,
        monthlyMode: 'date',
        monthDay: 12,
        endingType: 'until',
        untilDate: at({ days: 250 }),
      },
      registrationMode: 'sahaj-atlas',
      manager: ID.managers.eventManager,
      verificationStage: 'reminded',
      nextCheckAt: at({ days: 5, hour: 4 }),
      activityLog: [
        verification('email-link', tamsin, -23),
        reminder('verified', 'due', 'manager', tamsin, -7),
      ],
    },
  },
  // Monthly by weekday (second Saturday); region managers now join the reminders.
  {
    id: EVENT_IDS.escalated,
    data: {
      _status: 'published',
      title: 'Fixture Second Saturday Sitting',
      languages: ['en'],
      region: ID.regions.city,
      eventType: 'offline',
      address: address(
        'Fixture Reed Lane Rooms',
        '22 Reed Lane',
        'Fixture Harbourton',
        51.512,
        -0.131,
        'FX1 2AB',
      ),
      schedule: {
        firstDate: at({ days: -120, hour: 10 }),
        firstDate_tz: TZ,
        endTime: '11:30',
        recurrenceType: 'MONTHLY',
        interval: 1,
        monthlyMode: 'weekday',
        weekNumber: '2',
        weekdayOfMonth: 'SA',
      },
      registrationMode: 'sahaj-atlas',
      manager: MANAGER_IDS.programManager,
      verificationStage: 'escalated',
      nextCheckAt: at({ days: 4, hour: 4 }),
      activityLog: [
        verification('verify-action', rafael, -40),
        reminder('verified', 'due', 'manager', tamsin, -14),
        reminder('reminded', 'escalated', 'region', rafael, -7),
      ],
    },
  },
  // Every second Sunday, online, signing up elsewhere; the final reminder went out.
  {
    id: EVENT_IDS.urgent,
    data: {
      _status: 'published',
      title: 'Fixture Fortnightly Sunday Circle',
      languages: ['en'],
      region: REGION_IDS.citySecond,
      eventType: 'online',
      onlineUrl: 'https://example.invalid/rooms/fixture-sunday',
      schedule: {
        firstDate: at({ days: -30, hour: 16 }),
        firstDate_tz: TZ,
        recurrenceType: 'WEEKLY',
        interval: 2,
        weekdays: ['SU'],
      },
      registrationMode: 'external',
      externalRegistrationUrl: 'https://example.invalid/signup/fixture-sunday',
      manager: MANAGER_IDS.programManager,
      verificationStage: 'urgent',
      nextCheckAt: at({ days: 3, hour: 4 }),
      activityLog: [
        verification('re-save', tamsin, -60),
        reminder('escalated', 'urgent', 'region', rafael, -1),
      ],
    },
  },
  // Unpublished after the ladder ran out; trashed once its grace period ends.
  {
    id: EVENT_IDS.expired,
    data: {
      _status: 'draft',
      title: 'Fixture Wednesday Lapsed Class',
      languages: ['en'],
      region: ID.regions.city,
      eventType: 'offline',
      address: address(null, '31 Orchard Terrace', 'Fixture Harbourton', 51.505, -0.125, 'FX1 7KL'),
      schedule: {
        firstDate: at({ days: -200, hour: 19 }),
        firstDate_tz: TZ,
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['WE'],
      },
      registrationMode: 'sahaj-atlas',
      manager: ID.managers.eventManager,
      verificationStage: 'expired',
      nextCheckAt: at({ days: 9, hour: 4 }),
    },
  },
  // A one-off that is over, with nobody managing it: finished, still readable by id.
  {
    id: EVENT_IDS.finished,
    data: {
      _status: 'published',
      title: 'Fixture Autumn Open Evening',
      languages: ['en'],
      region: REGION_IDS.citySecond,
      eventType: 'offline',
      address: address(
        'Fixture Tidewater Library',
        '3 Quay Street',
        'Fixture Saltmere',
        51.201,
        0.301,
        'FX2 1AA',
      ),
      schedule: {
        firstDate: at({ days: -45, hour: 19 }),
        firstDate_tz: TZ,
        endTime: '20:30',
      },
      registrationMode: 'sahaj-atlas',
      verificationStage: 'finished',
      nextCheckAt: at({ days: 20, hour: 4 }),
    },
  },
  // Unmanaged and published so the community can vouch; its registrants are voting, in a tree with no manager.
  {
    id: EVENT_IDS.unverified,
    data: {
      _status: 'published',
      title: 'Fixture Copper Kettle Sitting',
      languages: ['en', 'fr'],
      description: rich('Listed from a visitor proposal; waiting for a manager to take it on.'),
      region: REGION_IDS.unmanagedVenue,
      eventType: 'offline',
      address: address(
        'Fixture Copper Kettle Hall',
        '9 Orchard Row',
        'Fixture Orchard Bay',
        48.751,
        2.151,
        'FX3 3MN',
      ),
      schedule: {
        firstDate: at({ days: -14, hour: 18 }),
        firstDate_tz: TZ,
        endTime: '19:15',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['TU'],
      },
      registrationMode: 'sahaj-atlas',
      registrationLimit: 20,
      verificationStage: 'unverified',
    },
  },
  // Voted down by the community: unpublished, closed to further votes.
  {
    id: EVENT_IDS.denied,
    data: {
      _status: 'draft',
      title: 'Fixture Disputed Monday Class',
      languages: ['en'],
      region: REGION_IDS.unmanagedCity,
      eventType: 'offline',
      address: address(null, '77 Cooper Lane', 'Fixture Orchard Bay', 48.74, 2.14, 'FX3 8PQ'),
      schedule: {
        firstDate: at({ days: -20, hour: 19 }),
        firstDate_tz: TZ,
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['MO'],
      },
      registrationMode: 'sahaj-atlas',
      verificationStage: 'denied',
    },
  },
  // Drafts the review import created, ahead of its published class.
  {
    id: 1_025_010,
    data: {
      _status: 'draft',
      importBatch: IMPORT_IDS.review,
      title: 'Fixture Reed Lane Sitting',
      languages: ['en'],
      region: ID.regions.city,
      eventType: 'offline',
      address: address(null, '22 Reed Lane', 'Fixture Harbourton', 51.512, -0.131, 'FX1 2AB'),
      schedule: {
        firstDate: at({ days: 10, hour: 19 }),
        firstDate_tz: TZ,
        endTime: '20:00',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['TH'],
      },
      registrationMode: 'sahaj-atlas',
      verificationStage: 'unverified',
    },
  },
  {
    id: 1_025_011,
    data: {
      _status: 'draft',
      importBatch: IMPORT_IDS.review,
      title: 'Fixture Mill Court Evening',
      languages: ['en'],
      region: ID.regions.city,
      eventType: 'offline',
      address: address(null, '5 Mill Court', 'Fixture Harbourton', 51.509, -0.127, 'FX1 3CD'),
      schedule: {
        firstDate: at({ days: 11, hour: 18, minute: 30 }),
        firstDate_tz: TZ,
        endTime: '19:30',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['FR'],
      },
      registrationMode: 'sahaj-atlas',
      verificationStage: 'unverified',
    },
  },
  {
    id: 1_025_012,
    data: {
      _status: 'published',
      importBatch: IMPORT_IDS.review,
      title: 'Fixture Garden Morning',
      languages: ['en'],
      region: ID.regions.city,
      eventType: 'offline',
      address: address(null, '1 Garden Row', 'Fixture Harbourton', 51.506, -0.122, 'FX1 4EF'),
      schedule: {
        firstDate: at({ days: 12, hour: 10 }),
        firstDate_tz: TZ,
        endTime: '11:00',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['SA'],
      },
      registrationMode: 'sahaj-atlas',
      verificationStage: 'unverified',
    },
  },
  // Both classes of the completed import, published: one adopted, one waiting.
  {
    id: 1_025_013,
    data: {
      _status: 'published',
      importBatch: IMPORT_IDS.completed,
      title: 'Fixture Quay Street Sitting',
      languages: ['en'],
      region: REGION_IDS.citySecond,
      eventType: 'offline',
      address: address(null, '3 Quay Street', 'Fixture Saltmere', 51.2, 0.3, 'FX2 1AA'),
      schedule: {
        firstDate: at({ days: -20, hour: 19 }),
        firstDate_tz: TZ,
        endTime: '20:00',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['TU'],
      },
      registrationMode: 'sahaj-atlas',
      manager: ID.managers.eventManager,
      verificationStage: 'verified',
      nextCheckAt: at({ days: 12, hour: 4 }),
      activityLog: [verification('re-save', tamsin, -18)],
    },
  },
  {
    id: 1_025_014,
    data: {
      _status: 'published',
      importBatch: IMPORT_IDS.completed,
      title: 'Fixture Online Wind Down',
      languages: ['en'],
      region: REGION_IDS.citySecond,
      eventType: 'online',
      onlineUrl: 'https://example.invalid/rooms/fixture-wind-down',
      schedule: {
        firstDate: at({ days: -18, hour: 21 }),
        firstDate_tz: TZ,
        endTime: '21:30',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['TH'],
      },
      registrationMode: 'sahaj-atlas',
      verificationStage: 'unverified',
    },
  },
  // Dormant: no schedule, so a way to reach the organiser stands in for it.
  {
    id: 1_025_015,
    data: {
      _status: 'published',
      title: 'Fixture Seasonal Retreat Group',
      languages: ['en'],
      description: rich('Meets when the season allows; get in touch for the next date.'),
      contactName: 'Ingrid',
      contactPhone: '+000 555 0199',
      region: REGION_IDS.citySecond,
      eventType: 'offline',
      address: address(null, '12 Harbour Wall', 'Fixture Saltmere', 51.203, 0.305, 'FX2 9ZZ'),
      inactive: true,
      registrationMode: 'sahaj-atlas',
      manager: MANAGER_IDS.programManager,
      verificationStage: 'verified',
      nextCheckAt: at({ days: 30, hour: 4 }),
      activityLog: [verification('verify-action', tamsin, -5)],
    },
  },

  // Monthly by weekday, one class per week-of-month and weekday the field offers.
  ...(
    [
      ['1', 'MO', 'First Monday'],
      ['3', 'TU', 'Third Tuesday'],
      ['4', 'WE', 'Fourth Wednesday'],
      ['-1', 'TH', 'Last Thursday'],
      ['1', 'FR', 'First Friday'],
      ['3', 'SU', 'Third Sunday'],
    ] as const
  ).map(([weekNumber, weekdayOfMonth, label], index) => ({
    id: 1_025_020 + index,
    data: {
      _status: 'published' as const,
      title: `Fixture ${label} Online Sit`,
      languages: ['en' as const],
      region: ID.regions.city,
      eventType: 'online' as const,
      onlineUrl: `https://example.invalid/rooms/fixture-monthly-${index + 1}`,
      schedule: {
        firstDate: at({ days: -90 + index, hour: 20 }),
        firstDate_tz: TZ,
        recurrenceType: 'MONTHLY' as const,
        interval: 1,
        monthlyMode: 'weekday' as const,
        weekNumber,
        weekdayOfMonth,
      },
      registrationMode: 'sahaj-atlas' as const,
      manager: MANAGER_IDS.programManager,
      verificationStage: 'verified' as const,
      nextCheckAt: at({ days: 15 + index, hour: 4 }),
    },
  })),
])
