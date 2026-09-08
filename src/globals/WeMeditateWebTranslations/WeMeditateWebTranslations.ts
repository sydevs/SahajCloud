import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { clientEnglishFallback } from '@/lib/translations/clientEnglishFallback'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateWebTranslations: GlobalConfig = {
  slug: 'wm-web-translations',
  admin: {
    group: 'WeMeditate Web',
  },
  versions: {
    max: 10,
    // Object form, not `drafts: true` — see the note on the Sahaj Atlas
    // translations global. `wm-app-translations` deliberately keeps
    // `drafts: true`, and so keeps one status for every locale.
    drafts: {
      localizeStatus: true,
    },
  },
  hooks: {
    afterRead: [clientEnglishFallback(translationsSchema as TranslationsSchema)],
  },
  label: 'Translations',
  fields: [
    {
      type: 'tabs',
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'wm-web-translations'),
    },
  ],
}
