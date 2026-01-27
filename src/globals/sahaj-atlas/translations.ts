import type { GlobalConfig } from 'payload'

import { JSONSchema4 } from 'json-schema'

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
  fields: [
    {
      name: 'strings',
      type: 'json',
      localized: true,
      admin: {
        description: 'Translation strings (key -> translated text)',
      },
      jsonSchema: {
        uri: 'a://sy-atlas-translations.json',
        fileMatch: ['a://sy-atlas-translations.json'],
        schema: translationsSchema as JSONSchema4,
      },
    },
  ],
}
