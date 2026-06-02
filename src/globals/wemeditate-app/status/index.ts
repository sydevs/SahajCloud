import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

import { adminOnlyFieldAccess } from '@/lib/access'
import { buildStatusGlobalConfig, type StatusGlobalSpec } from '@/lib/status'

import { appCardsSection } from './appCards'
import { appConfigSection } from './appConfig'
import { lecturesSection } from './lectures'
import { lessonsSection } from './lessons'
import { pagesSection } from './pages'
import {
  DEFAULT_BASELINE_COUNTRY,
  extractWeMeditateAppStatusConfig,
  type WeMeditateAppStatusConfig,
} from './shared'
import { translationsSection } from './translations'
import { userChoicesSection } from './userChoices'

countries.registerLocale(enLocale)

const COUNTRY_OPTIONS = Object.entries(countries.getNames('en'))
  .map(([value, label]) => ({ label: label as string, value }))
  .sort((a, b) => a.label.localeCompare(b.label))

export const WeMeditateAppStatusSpec: StatusGlobalSpec<WeMeditateAppStatusConfig> = {
  slug: 'wm-app-status',
  label: 'Launch Readiness',
  adminGroup: 'WeMeditate App',
  configTabFields: [
    {
      name: 'launchCriticalAppCards',
      type: 'relationship',
      relationTo: 'app-cards',
      hasMany: true,
      access: { update: adminOnlyFieldAccess },
      admin: {
        description:
          'App cards that must be ready before launch. All other app cards roll up under the optional "other-cards" group.',
      },
    },
    {
      name: 'baselineCountry',
      type: 'select',
      options: COUNTRY_OPTIONS,
      localized: true,
      required: true,
      defaultValue: DEFAULT_BASELINE_COUNTRY,
      access: { update: adminOnlyFieldAccess },
      admin: {
        description: 'Baseline country used to resolve the new-user audience set for this locale.',
      },
    },
  ],
  extractConfig: extractWeMeditateAppStatusConfig,
  sections: [
    userChoicesSection,
    lessonsSection,
    lecturesSection,
    pagesSection,
    appConfigSection,
    translationsSection,
    appCardsSection,
  ],
  // Group key → admin collection slug for deep-link construction in the
  // readiness widget. Keys deliberately omitted here render as plain text
  // in the documents-table (either non-collection rows or aggregate groups).
  groupCollectionMap: {
    // userChoices section
    featured: 'user-choices',
    duration: 'user-choices',
    'non-featured-morning': 'user-choices',
    'non-featured-afternoon': 'user-choices',
    'non-featured-evening': 'user-choices',
    'non-featured-night': 'user-choices',
    // lessons section
    'unit-1': 'lessons',
    'unit-2': 'lessons',
    'unit-3': 'lessons',
    'unit-4': 'lessons',
    // lectures section
    'user-choice-coverage': 'user-choices',
    'lesson-referenced-subtitles': 'lectures',
    // pages section
    'core-pages': 'pages',
    'subtle-system-pages': 'pages',
    // appCards section
    'launch-critical-cards': 'app-cards',
    'other-cards': 'app-cards',
  },
  // Group key → global slug for groups whose rows link to a global instead of a collection.
  groupGlobalMap: {
    // translations section — each tab group links to the translations global
    ...Object.fromEntries(translationsSection.groups.map((g) => [g.key, 'wm-app-translations'])),
    // appConfig section — relationships/config rows all live in the app config global
    'self-realization-meditation': 'wm-app-config',
    'post-realization-lecture': 'wm-app-config',
    'vibe-check-tracks': 'wm-app-config',
  },
  // Section key → global slug for the section card's "Edit configuration"
  // link. Used when the section's rows aren't backed by a collection
  // (config-slot rows for appConfig, virtual rows for translations) so
  // managers still have a one-click path to the source of truth.
  sectionConfigFallback: {
    appConfig: { type: 'global', slug: 'wm-app-config' },
    translations: { type: 'global', slug: 'wm-app-translations' },
  },
}

export const WeMeditateAppStatus = buildStatusGlobalConfig(WeMeditateAppStatusSpec)

export {
  appCardsSection,
  appConfigSection,
  extractWeMeditateAppStatusConfig,
  lecturesSection,
  lessonsSection,
  pagesSection,
  translationsSection,
  userChoicesSection,
  type WeMeditateAppStatusConfig,
}
