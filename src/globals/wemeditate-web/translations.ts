import type { GlobalConfig } from 'payload'

import { JSONSchema4 } from 'json-schema'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateWebTranslations: GlobalConfig = {
  slug: 'wm-web-translations',
  admin: {
    group: 'WeMeditate Web',
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
        uri: 'a://wm-web-translations.json',
        fileMatch: ['a://wm-web-translations.json'],
        schema: translationsSchema as JSONSchema4,
      },
    },
  ],
}
