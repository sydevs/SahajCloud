import type { GlobalConfig } from 'payload'

import {
  buildTranslationTabs,
  translationReviewFields,
  translationReviewHook,
  type TranslationsSchema,
} from '@/fields/translationsField'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateAppTranslations: GlobalConfig = {
  slug: 'wm-app-translations',
  admin: {
    group: 'WeMeditate App',
  },
  versions: {
    max: 3,
  },
  hooks: {
    beforeChange: [translationReviewHook],
  },
  label: 'Translations',
  fields: [
    ...translationReviewFields,
    {
      type: 'tabs',
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'wm-app-translations'),
    },
  ],
}
