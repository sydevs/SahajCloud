import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateAppTranslations: GlobalConfig = {
  slug: 'wm-app-translations',
  admin: {
    group: 'WeMeditate App',
    livePreview: {
      // Payload's native live preview. The hosted WeMeditate App page
      // reimplements Payload's live-preview client (subscribe/ready) and
      // renders the screen for whichever section the translator is editing
      // (auto-follow). `secret` lets that page read unpublished drafts via the
      // API (see src/lib/utilities/previewSecret.ts).
      //
      // Needs WEMEDITATE_APP_URL — and on Railway it must be present at BUILD
      // time too, since `headers()` (the CSP frame-src) is baked at build.
      url: ({ locale }) => {
        const baseURL = process.env.WEMEDITATE_APP_URL
        if (!baseURL) return ''
        return `${baseURL}/${locale.code}/preview/wm-app-translations?secret=${process.env.SAHAJCLOUD_PREVIEW_SECRET}`
      },
      breakpoints: [{ name: 'mobile', label: 'Mobile', width: 390, height: 800 }],
    },
  },
  versions: {
    max: 10,
    drafts: true,
  },
  label: 'Translations',
  fields: [
    {
      type: 'tabs',
      tabs: buildTranslationTabs(translationsSchema as TranslationsSchema, 'wm-app-translations'),
    },
  ],
}
