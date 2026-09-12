import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { serverEnv } from '@/lib/env'
import { clientEnglishFallback } from '@/lib/translations/clientEnglishFallback'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const SahajAtlasTranslations: GlobalConfig = {
  slug: 'sy-atlas-translations',
  admin: {
    group: 'Sahaj Atlas',
    // The widget's live-preview boot route, which renders the base view. A tab
    // declaring a `preview` in the schema repoints the panel at that view
    // (`previewTargetField`), keeping this origin and this query.
    //
    // ⚠ **This reads `locale` and never `data`.** Payload re-resolves the URL
    // whenever the server-rendered value changes and overwrites whatever the
    // panel is showing (`@payloadcms/ui/dist/providers/LivePreview/index.js:100-104`),
    // so a data-dependent URL would clobber the repoint on every save. A
    // locale-dependent one changes only on a locale switch, which is exactly
    // when the tab's component re-composes anyway.
    livePreview: {
      url: ({ locale }) =>
        `${serverEnv.SAHAJATLAS_URL}/preview?secret=${serverEnv.SAHAJCLOUD_PREVIEW_SECRET}&locale=${locale.code}`,
      // Phone-sized frame, matching the Events and Regions previews — the
      // widget's drawer layout is designed against it.
      breakpoints: [{ label: 'Mobile', name: 'mobile', width: 390, height: 844 }],
    },
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
