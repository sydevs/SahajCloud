import type { GlobalConfig } from 'payload'

import { JSONSchema4 } from 'json-schema'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateAppTranslations: GlobalConfig = {
  slug: 'wm-app-translations',
  admin: {
    group: 'WeMeditate App',
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
        uri: 'a://wm-app-translations.json',
        fileMatch: ['a://wm-app-translations.json'],
        schema: translationsSchema as JSONSchema4,
      },
    },
  ],
}
