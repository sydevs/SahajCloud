import { SahajAtlasConfig } from './sahaj-atlas/config'
import { SahajAtlasTranslations } from './sahaj-atlas/translations'
import { WeMeditateAppConfig } from './wemeditate-app/config'
import { WeMeditateAppStatus } from './wemeditate-app/status'
import { WeMeditateAppTranslations } from './wemeditate-app/translations'
import { WeMeditateWebConfig } from './wemeditate-web/config'
import { WeMeditateWebTranslations } from './wemeditate-web/translations'

export const globals = [
  WeMeditateWebConfig,
  WeMeditateWebTranslations,
  WeMeditateAppConfig,
  WeMeditateAppTranslations,
  WeMeditateAppStatus,
  SahajAtlasConfig,
  SahajAtlasTranslations,
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
