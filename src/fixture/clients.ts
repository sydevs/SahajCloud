import { at } from './at'
import { ID } from './ids'
import { MANAGER_IDS } from './managers'
import { REGION_IDS } from './regions'
import { fixture } from './types'

export const CLIENT_IDS = {
  appOnly: 1_022_004,
  mixed: 1_022_005,
  dormant: 1_022_006,
  hosted: 1_022_007,
  emptyRegion: 1_022_008,
} as const

export default fixture('clients', [
  // An installed, verified embed that owns its region: the finished end of the Install tab.
  {
    id: ID.clients.first,
    data: {
      label: 'Fixture Vasanta Community Site',
      enabled: true,
      enableAPIKey: true,
      notes: 'Install complete: embed verified, owns the country atlas links.',
      roles: ['sahaj-atlas-client'],
      managers: [ID.managers.regionManager, ID.managers.admin],
      primaryContact: ID.managers.regionManager,
      region: ID.regions.country,
      title: 'Vasanta Meditation',
      supportEmail: 'hello@fixture-vasanta.invalid',
      logo: ID.images.logo,
      color1: '#1E6C71',
      color2: '#5E98BA',
      color3: '#D8735A',
      language: 'en',
      site: {
        domain: 'classes.fixture-vasanta.example.invalid',
        page: '/classes',
        track: 'custom',
        embedHeight: 'fixed',
      },
      mailingList: {
        provider: 'mailchimp',
        listId: 'fixture-audience-1',
        apiKey: 'fixture-not-a-real-key-1',
        doubleOptIn: true,
      },
      canonical: {
        owned: true,
        nextVerifyAt: at({ days: 1, hour: 3 }),
        verification: {
          verified: {
            domain: 'classes.fixture-vasanta.example.invalid',
            mount: 'https://classes.fixture-vasanta.example.invalid/classes',
            widgetVersion: 12,
            at: at({ days: -2, hour: 3 }),
          },
          failureCount: 0,
          attempts: [
            { at: at({ days: -3, hour: 3 }), status: 'inconclusive', reason: 'quota' },
            { at: at({ days: -2, hour: 3 }), status: 'verified' },
          ],
          routingProbe: { at: at({ days: -2, hour: 3 }), verdict: 'path', failedAttempts: 0 },
          seo: {
            at: at({ days: -2, hour: 3 }),
            results: [
              { route: '/', check: 'title', status: 'pass' },
              { route: '/', check: 'canonical', status: 'pass' },
              { route: '/', check: 'json-ld', status: 'pass' },
              { route: '/', check: 'body', status: 'pass' },
              {
                route: '/fixture-harbourton',
                check: 'sitemap',
                status: 'fail',
                detail: 'Not listed in robots.txt.',
              },
            ],
          },
        },
      },
      embedMetadata: {
        'https://classes.fixture-vasanta.example.invalid/classes': {
          mode: 'inline',
          topLevel: true,
          urlWritable: true,
          paramPersisted: false,
          routing: 'path',
          lastSeen: at({ days: -1, hour: 9 }),
        },
        'https://classes.fixture-vasanta.example.invalid/events': {
          mode: 'iframe',
          topLevel: false,
          urlWritable: false,
          paramPersisted: false,
          routing: 'query',
          lastSeen: at({ days: -6, hour: 14 }),
        },
      },
      usage: {
        dailyRequests: 140,
        peakDailyRequests: 920,
        totalRequests: 15400,
        highUsageDays: 2,
        lastRequestAt: at({ days: 0, hour: 8 }),
        lastHighUsageAt: at({ days: -20, hour: 11 }),
        firstRequestAt: at({ days: -120, hour: 10 }),
      },
    },
  },
  // Install begun and failing: the embed is not found on its page yet.
  {
    id: ID.clients.second,
    data: {
      label: 'Fixture Harbourton Centre',
      enabled: true,
      enableAPIKey: true,
      roles: ['sahaj-atlas-client'],
      managers: [ID.managers.regionManager],
      region: ID.regions.city,
      title: 'Harbourton Meditation Centre',
      color1: '#2F5D8A',
      language: 'es',
      site: {
        domain: 'harbourton-centre.example.invalid',
        page: '/?p=42',
        track: 'wp-selfhosted',
        embedHeight: 'screen',
      },
      mailingList: {
        provider: 'brevo',
        listId: 'fixture-list-2',
        apiKey: 'fixture-not-a-real-key-2',
      },
      canonical: {
        owned: false,
        nextVerifyAt: at({ days: 0, hour: 3 }),
        verification: {
          verified: null,
          failureCount: 2,
          attempts: [
            { at: at({ days: -2, hour: 3 }), status: 'failed', reason: 'marker-absent' },
            { at: at({ days: -1, hour: 3 }), status: 'failed', reason: 'http' },
          ],
        },
      },
      usage: { dailyRequests: 12, totalRequests: 310, firstRequestAt: at({ days: -9, hour: 15 }) },
    },
  },
  {
    id: ID.clients.third,
    data: {
      label: 'Fixture Saltmere Group',
      enabled: true,
      enableAPIKey: true,
      roles: ['sahaj-atlas-client'],
      managers: [ID.managers.admin, ID.managers.eventManager],
      primaryContact: ID.managers.admin,
      region: REGION_IDS.citySecond,
      title: 'Saltmere Meditation',
      language: 'de',
      site: {
        domain: 'saltmere-meditation.example.invalid',
        page: '/map',
        track: 'wix',
        embedHeight: 'window',
      },
      mailingList: {
        provider: 'klaviyo',
        listId: 'fixture-list-3',
        apiKey: 'fixture-not-a-real-key-3',
      },
      canonical: {
        owned: false,
        nextVerifyAt: at({ days: 2, hour: 3 }),
        verification: {
          verified: null,
          failureCount: 0,
          attempts: [
            { at: at({ days: -1, hour: 3 }), status: 'inconclusive', reason: 'bot-challenge' },
          ],
          routingProbe: { at: at({ days: -1, hour: 3 }), verdict: 'query', failedAttempts: 1 },
        },
      },
    },
  },
  {
    id: CLIENT_IDS.appOnly,
    data: {
      label: 'Fixture Mobile App',
      enabled: true,
      enableAPIKey: true,
      notes: 'An app key: no site, no atlas.',
      roles: ['wemeditate-app-client'],
      managers: [ID.managers.admin],
      usage: { dailyRequests: 4200, peakDailyRequests: 9800, totalRequests: 3100000 },
    },
  },
  {
    id: CLIENT_IDS.mixed,
    data: {
      label: 'Fixture Orchard Web and Atlas',
      enabled: true,
      enableAPIKey: true,
      roles: ['wemeditate-web-client', 'sahaj-atlas-client'],
      managers: [MANAGER_IDS.programManager],
      region: REGION_IDS.unmanagedCity,
      language: 'fr',
      site: {
        domain: 'orchard-yoga.example.invalid',
        page: '/classes',
        track: 'squarespace',
        embedHeight: 'fixed',
      },
      mailingList: {
        provider: 'cleverreach',
        clientId: 'fixture-cr-client',
        listId: 'fixture-group-5',
        apiKey: 'fixture-not-a-real-key-5',
        doubleOptIn: true,
        doiFlowId: 'fixture-flow-5',
      },
      canonical: { owned: false },
    },
  },
  {
    id: CLIENT_IDS.dormant,
    data: {
      label: 'Fixture Dormant Iframe Site',
      enabled: false,
      enableAPIKey: true,
      roles: ['sahaj-atlas-client'],
      managers: [ID.managers.inactive],
      site: {
        domain: 'dormant-iframe.example.invalid',
        page: '/atlas',
        track: 'iframe',
        embedHeight: 'screen',
      },
      canonical: { owned: false },
    },
  },
  {
    id: CLIENT_IDS.hosted,
    data: {
      label: 'Fixture Hosted Blog Site',
      enabled: true,
      enableAPIKey: true,
      roles: ['sahaj-atlas-client'],
      managers: [ID.managers.eventManager],
      region: REGION_IDS.unmanagedRegion,
      site: {
        domain: 'fixture-blog.example.invalid',
        page: '/atlas',
        track: 'wp-com',
        embedHeight: 'fixed',
      },
      canonical: { owned: false },
    },
  },
  // Set up before its first class: the Atlas tab's preview has nothing to draw.
  {
    id: CLIENT_IDS.emptyRegion,
    data: {
      label: 'Fixture Wellspring Circle',
      enabled: true,
      enableAPIKey: true,
      roles: ['sahaj-atlas-client'],
      managers: [ID.managers.regionManager],
      region: REGION_IDS.cityEmpty,
      title: 'Wellspring Meditation',
      color1: '#6B4E9B',
      language: 'en',
      site: {
        domain: 'wellspring-circle.example.invalid',
        page: '/classes',
        track: 'custom',
        embedHeight: 'fixed',
      },
      canonical: { owned: false },
    },
  },
])
