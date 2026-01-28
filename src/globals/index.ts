import { SahajAtlasConfig } from './sahaj-atlas/config'
import { SahajAtlasTranslations } from './sahaj-atlas/translations'
import { WeMeditateAppConfig } from './wemeditate-app/config'
import { WeMeditateAppTranslations } from './wemeditate-app/translations'
import { WeMeditateWebConfig } from './wemeditate-web/config'
import { WeMeditateWebTranslations } from './wemeditate-web/translations'

export const globals = [
  WeMeditateWebConfig,
  WeMeditateWebTranslations,
  WeMeditateAppConfig,
  WeMeditateAppTranslations,
  SahajAtlasConfig,
  SahajAtlasTranslations,
]

export {
  SahajAtlasConfig,
  SahajAtlasTranslations,
  WeMeditateAppConfig,
  WeMeditateAppTranslations,
  WeMeditateWebConfig,
  WeMeditateWebTranslations,
}
