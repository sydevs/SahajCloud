import { ID } from './ids'
import { fixture } from './types'

export const MANAGER_IDS = {
  programManager: 1_001_006,
  regionManagerNorth: 1_001_007,
  translator: 1_001_008,
} as const

export default fixture('managers', [
  {
    id: ID.managers.admin,
    data: {
      _verified: true,
      type: 'admin',
      name: 'Odalys Marchetti',
      email: 'odalys.marchetti@fixture.invalid',
      currentProject: 'sahaj-atlas',
      language: 'en',
    },
  },
  // Manages the anchor city, and so its venue, through the region listing.
  {
    id: ID.managers.regionManager,
    data: {
      _verified: true,
      type: 'manager',
      name: 'Rafael Quintero',
      email: 'rafael.quintero@fixture.invalid',
      currentProject: 'sahaj-atlas',
      language: 'es',
      contactDetails: [
        { platform: 'whatsapp', identifier: '+000 555 0101', verified: true },
        { platform: 'telegram', identifier: '@fixture_rafael' },
      ],
      notificationPreferences: {
        invitation: { frequency: 'Immediate', method: 'email' },
        event_verification: { frequency: 'Monthly', method: 'email' },
        event_registration: { frequency: 'Daily', method: 'whatsapp' },
        new_proposals: { frequency: 'Immediate', method: 'telegram' },
        open_items: { frequency: 'Weekly', method: 'email' },
      },
    },
  },
  // Named on events and listed on no region.
  {
    id: ID.managers.eventManager,
    data: {
      _verified: true,
      type: 'manager',
      name: 'Tamsin Okafor-Reyes',
      email: 'tamsin.okaforreyes@fixture.invalid',
      currentProject: 'sahaj-atlas',
      language: 'en',
      contactDetails: [{ platform: 'wechat', identifier: 'fixture-tamsin' }],
      notificationPreferences: {
        invitation: { frequency: 'Never' },
        event_verification: { frequency: '3 Months', method: 'wechat' },
        event_registration: { frequency: 'Immediate', method: 'email' },
        open_items: { frequency: 'Monthly', method: 'email' },
      },
    },
  },
  {
    id: ID.managers.inactive,
    data: {
      _verified: true,
      type: 'inactive',
      name: 'Bertil Svensson-Lind',
      email: 'bertil.svenssonlind@fixture.invalid',
    },
  },
  // Holds every stored role.
  {
    id: ID.managers.contentEditor,
    data: {
      _verified: true,
      type: 'manager',
      name: 'Noor Haddad-Whitlock',
      email: 'noor.haddadwhitlock@fixture.invalid',
      currentProject: 'wemeditate-web',
      roles: ['meditations-editor', 'path-editor', 'web-translator'],
      language: 'fr',
    },
    locales: { fr: { roles: ['web-translator'] } },
  },
  {
    id: MANAGER_IDS.programManager,
    data: {
      _verified: true,
      type: 'manager',
      name: 'Ingrid Valtonen',
      email: 'ingrid.valtonen@fixture.invalid',
      currentProject: 'wemeditate-app',
      notificationPreferences: {
        event_verification: { frequency: '6 Months', method: 'email' },
        event_registration: { frequency: 'Weekly', method: 'email' },
      },
    },
  },
  // Above the anchor city, so a manager up the chain.
  {
    id: MANAGER_IDS.regionManagerNorth,
    data: {
      _verified: true,
      type: 'manager',
      name: 'Kwame Baptiste',
      email: 'kwame.baptiste@fixture.invalid',
      currentProject: 'sahaj-atlas',
    },
  },
  {
    id: MANAGER_IDS.translator,
    data: {
      _verified: true,
      type: 'manager',
      name: 'Saoirse Delacroix',
      email: 'saoirse.delacroix@fixture.invalid',
      roles: ['web-translator'],
      language: 'de',
    },
  },
])
