import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const SahajAtlasTranslations: GlobalConfig = {
  slug: 'sy-atlas-translations',
  admin: {
    group: 'Sahaj Atlas',
  },
  versions: {
    max: 10,
    drafts: true,
  },
  label: 'Translations',
  fields: [
    {
      type: 'tabs',
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'sy-atlas-translations'),
    },
  ],
}
