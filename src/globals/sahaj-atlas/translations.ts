import type { GlobalConfig } from 'payload'

import {
  buildTranslationTabs,
  translationReviewFields,
  translationReviewHook,
  type TranslationsSchema,
} from '@/fields/translationsField'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const SahajAtlasTranslations: GlobalConfig = {
  slug: 'sy-atlas-translations',
  admin: {
    group: 'Sahaj Atlas',
  },
  versions: {
    max: 3,
  },
  label: 'Translations',
  hooks: {
    beforeChange: [translationReviewHook],
  },
  fields: [
    ...translationReviewFields,
    {
      type: 'tabs',
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'sy-atlas-translations'),
    },
  ],
}
