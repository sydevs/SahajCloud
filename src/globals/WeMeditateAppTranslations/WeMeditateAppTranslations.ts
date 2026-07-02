import type { GlobalConfig } from 'payload'

import { buildTranslationTabs, type TranslationsSchema } from '@/fields/translationsField'
import { appLivePreview } from '@/lib/preview/appLivePreview'

import translationsSchema from './translationsSchema.json' with { type: 'json' }

export const WeMeditateAppTranslations: GlobalConfig = {
  slug: 'wm-app-translations',
  admin: {
    group: 'WeMeditate App',
    // Payload's native live preview, pointed at the WeMeditate App web host
    // (the app-as-preview-engine). The app parses `?global=wm-app-translations`
    // and renders a real translation-driven screen with the editor's changes
    // overlaid on the English base (see lib/preview/translation_preview.dart in
    // the app repo). A screen picker in the preview switches between screens.
    livePreview: appLivePreview('wm-app-translations', 'global'),
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
