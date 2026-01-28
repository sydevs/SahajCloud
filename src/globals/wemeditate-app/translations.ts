import type { JSONSchema4 } from 'json-schema'
import type { GlobalConfig } from 'payload'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

// Extract entries from schema for the component
const schemaEntries = Object.entries(
  (translationsSchema as { properties?: Record<string, { description?: string }> }).properties ||
    {},
).map(([key, prop]) => ({
  key,
  description: prop.description || '',
}))

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
        components: {
          Field: '@/components/admin/TranslationsTable',
        },
        custom: {
          schemaEntries,
          globalSlug: 'wm-app-translations',
        },
      },
      jsonSchema: {
        uri: 'a://wm-app-translations.json',
        fileMatch: ['a://wm-app-translations.json'],
        schema: translationsSchema as JSONSchema4,
      },
    },
  ],
}
