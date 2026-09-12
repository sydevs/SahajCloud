import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { serverEnv } from '@/lib/env'
import { clientEnglishFallback } from '@/lib/translations/clientEnglishFallback'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const SahajAtlasTranslations: GlobalConfig = {
  slug: 'sy-atlas-translations',
  admin: {
    group: 'Sahaj Atlas',
    // The widget's own root, which renders the base view. A tab declaring a
    // `preview` in the schema repoints the panel at that view
    // (`previewTargetField`), keeping this origin and this query.
    //
    // ⚠ **Not `/preview`.** That boot route wants a document: with no
    // `collection` and `id` the widget renders `PreviewFallback` — "Save this
    // document to preview it." over a click-swallowing `fixed inset-0`
    // (SahajAtlasWeb `components/preview/PreviewController.tsx`). Eight
    // untargeted tabs sit on this URL, and every targeted tab restores to it,
    // so it has to be a view the widget actually draws. `locale` rides along
    // because the widget detects it from the query string first
    // (`i18nDetectionOptions.order`, `LOCALE_PARAM`).
    //
    // A repointed panel therefore shows PUBLISHED translations, here and on
    // every target: `readPreviewParams` returns null off `/preview`, so no
    // path a target composes opens a draft session. sydevs/SahajAtlasWeb#198
    // is the route that would.
    //
    // ⚠ **And so this URL carries no `secret`.** A preview secret is only ever
    // read on the route that also scrubs it from the address bar at boot
    // (`capturePreview` — "the secret lives only in memory"). Off that route
    // nothing reads it and nothing removes it, so it would sit in the panel's
    // URL for the whole editing session, for no reader. Add it back with the
    // route that reads it, not before.
    //
    // ⚠ **This reads `locale` and never `data`.** Payload re-resolves the URL
    // whenever the server-rendered value changes and overwrites whatever the
    // panel is showing (`@payloadcms/ui/dist/providers/LivePreview/index.js:100-104`),
    // so a data-dependent URL would clobber the repoint on every save. A
    // locale-dependent one changes only on a locale switch, which is exactly
    // when the tab's component re-composes anyway.
    livePreview: {
      url: ({ locale }) =>
        `${serverEnv.SAHAJATLAS_URL}/?locale=${locale.code}`,
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
