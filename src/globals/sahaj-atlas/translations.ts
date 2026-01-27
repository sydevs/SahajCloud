import type { GlobalConfig } from 'payload'

import { JSONSchema4 } from 'json-schema'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

// Extract entries from schema for the component
const schemaEntries = Object.entries(
  (translationsSchema as { properties?: Record<string, { description?: string }> }).properties ||
    {},
).map(([key, prop]) => ({
  key,
  description: prop.description || '',
}))

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
        components: {
          Field: '@/components/admin/TranslationsTable',
        },
        custom: {
          schemaEntries,
          globalSlug: 'sy-atlas-translations',
        },
      },
      jsonSchema: {
        uri: 'a://sy-atlas-translations.json',
        fileMatch: ['a://sy-atlas-translations.json'],
        schema: translationsSchema as JSONSchema4,
      },
    },
  ],
}
