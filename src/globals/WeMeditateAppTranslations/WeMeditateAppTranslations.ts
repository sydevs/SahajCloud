import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { clientEnglishFallback } from '@/lib/translations/clientEnglishFallback'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateAppTranslations: GlobalConfig = {
  slug: 'wm-app-translations',
  admin: {
    group: 'WeMeditate App',
  },
  versions: {
    max: 10,
    // Object form, not `drafts: true` — see the note on the Sahaj Atlas
    // translations global. With #709 all three translations globals opt in, so
    // "published in French" is a fact the CMS can answer for the app too.
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
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'wm-app-translations'),
    },
  ],
}
