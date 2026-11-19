import type { DefaultsSchema, TranslationsTarget } from '@/lib/translations/englishDefaults'

import { SahajAtlasConfig } from './SahajAtlasConfig/SahajAtlasConfig'
import { SahajAtlasTranslations } from './SahajAtlasTranslations/SahajAtlasTranslations'
import syAtlasTranslationsSchema from './SahajAtlasTranslations/translationsSchema.json' with { type: 'json' }
import { WeMeditateAppConfig } from './WeMeditateAppConfig/WeMeditateAppConfig'
import { WeMeditateAppStatus } from './WeMeditateAppStatus/WeMeditateAppStatus'
import wmAppTranslationsSchema from './WeMeditateAppTranslations/translationsSchema.json' with { type: 'json' }
import { WeMeditateAppTranslations } from './WeMeditateAppTranslations/WeMeditateAppTranslations'
import { WeMeditateWebConfig } from './WeMeditateWebConfig/WeMeditateWebConfig'
import wmWebTranslationsSchema from './WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }
import { WeMeditateWebTranslations } from './WeMeditateWebTranslations/WeMeditateWebTranslations'

export const globals = [
  WeMeditateWebConfig,
  WeMeditateWebTranslations,
  WeMeditateAppConfig,
  WeMeditateAppTranslations,
  WeMeditateAppStatus,
  SahajAtlasConfig,
  SahajAtlasTranslations,
]

/**
 * The three translations globals, each with the schema that declares its keys.
 *
 * Read by the English-defaults reconciliation on boot and by the translations
 * seed, both of which answer the same question for all three at once. The
 * barrel is where it lives because nothing else may reach into a global's
 * folder.
 */
export const TRANSLATIONS_TARGETS: TranslationsTarget[] = [
  { slug: 'wm-web-translations', schema: wmWebTranslationsSchema as unknown as DefaultsSchema },
  { slug: 'wm-app-translations', schema: wmAppTranslationsSchema as unknown as DefaultsSchema },
  { slug: 'sy-atlas-translations', schema: syAtlasTranslationsSchema as unknown as DefaultsSchema },
]

export {
  SahajAtlasConfig,
  SahajAtlasTranslations,
  WeMeditateAppConfig,
  WeMeditateAppStatus,
  WeMeditateAppTranslations,
  WeMeditateWebConfig,
  WeMeditateWebTranslations,
}
