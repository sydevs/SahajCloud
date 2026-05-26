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
  collections: {
    userChoices: { tutorialLink: null },
    lessons: { tutorialLink: null },
    lectures: { tutorialLink: null },
    pages: { tutorialLink: null },
    appCards: { tutorialLink: null },
    appConfig: { tutorialLink: null },
    translations: { tutorialLink: null },
  },
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
        description:
          'Baseline country used to resolve the new-user audience set for this locale.',
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
