import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { serverEnv } from '@/lib/env'
import { livePreviewUrl } from '@/lib/livePreview/url'
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
    //
    // ⚠ **And no `secret`.** WeMeditateWeb reads one under `pages/preview/`
    // alone, where it is required and a miss is a 403. A published page never
    // reads it and never strips it, so it would ride the panel's URL — into
    // Sentry's session replay, which this site runs — for no reader. See the
    // Sahaj Atlas global.
    livePreview: {
      // Now carries the credential. #773 had to strip it: `/preview` was the
      // only route that read *and* scrubbed one, so a secret sent anywhere
      // else sat in the panel's URL for a whole editing session. Every route
      // reads and scrubs a token now, which is what re-earns it — and a
      // translator finally sees the string they are editing, rather than the
      // published copy #776 was filed about.
      //
      // Reads `locale`, never `data`: a data-dependent URL re-resolves on save
      // and clobbers a tab's repoint (#708).
      url: ({ locale }) =>
        livePreviewUrl({
          base: serverEnv.WEMEDITATE_WEB_URL,
          // ⚠ The trailing slash is load-bearing. A tab's relative target
          // (`map`) resolves against this URL: under `/fr/` it becomes
          // `/fr/map`, but under `/fr` it hoists to `/map` and the edited
          // locale is silently lost.
          path: locale.code === 'en' ? '' : `${locale.code}/`,
          params: { scope: 'wm-web-translations' },
        }),
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
