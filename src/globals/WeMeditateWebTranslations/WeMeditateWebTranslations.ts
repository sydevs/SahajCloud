import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { serverEnv } from '@/lib/env'
import { clientEnglishFallback } from '@/lib/translations/clientEnglishFallback'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateWebTranslations: GlobalConfig = {
  slug: 'wm-web-translations',
  admin: {
    group: 'WeMeditate Web',
    // The site's home page in the edited locale. Every string in this global
    // renders on a real page (WeMeditateWeb#80), so the real pages are the
    // preview — there is no synthetic route to keep equal to them.
    //
    // ⚠ Two things this URL has to be. It reads `locale` and never `data`, for
    // the reason spelled out on the Sahaj Atlas translations global. And it
    // **ends in a slash**, because a tab's `preview.path` resolves against it:
    // `map` under `…/fr/` is `…/fr/map`, and under `…/fr` it would be `…/map`,
    // silently dropping the locale the translator is editing.
    livePreview: {
      url: ({ locale }) =>
        `${serverEnv.WEMEDITATE_WEB_URL}/${locale.code}/?secret=${serverEnv.SAHAJCLOUD_PREVIEW_SECRET}`,
    },
  },
  versions: {
    max: 10,
    // Object form, not `drafts: true` — see the note on the Sahaj Atlas
    // translations global. All three translations globals set this since
    // #709.
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
