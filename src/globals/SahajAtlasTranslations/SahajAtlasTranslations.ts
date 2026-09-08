import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { clientEnglishFallback } from '@/lib/translations/clientEnglishFallback'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const SahajAtlasTranslations: GlobalConfig = {
  slug: 'sy-atlas-translations',
  admin: {
    group: 'Sahaj Atlas',
  },
  versions: {
    max: 10,
    // Object form, not `drafts: true` — that sanitises `localizeStatus` back to
    // false. With it, `_status` is stored per locale, so publishing French says
    // nothing about German, and `availableLocales` on `sy-atlas-config` can gate
    // on it.
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
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'sy-atlas-translations'),
    },
  ],
}
