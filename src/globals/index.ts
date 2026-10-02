import { SahajaGlossary } from './SahajaGlossary/SahajaGlossary'
import { SahajAtlasConfig } from './SahajAtlasConfig/SahajAtlasConfig'
import { SahajAtlasTranslations } from './SahajAtlasTranslations/SahajAtlasTranslations'
import { WeMeditateAppConfig } from './WeMeditateAppConfig/WeMeditateAppConfig'
import { WeMeditateAppStatus } from './WeMeditateAppStatus/WeMeditateAppStatus'
import { WeMeditateAppTranslations } from './WeMeditateAppTranslations/WeMeditateAppTranslations'
import { WeMeditateWebConfig } from './WeMeditateWebConfig/WeMeditateWebConfig'
import { WeMeditateWebTranslations } from './WeMeditateWebTranslations/WeMeditateWebTranslations'

export const globals = [
  WeMeditateWebConfig,
  WeMeditateWebTranslations,
  WeMeditateAppConfig,
  WeMeditateAppTranslations,
  WeMeditateAppStatus,
  SahajAtlasConfig,
  SahajAtlasTranslations,
  SahajaGlossary,
]

export {
  SahajAtlasConfig,
  SahajAtlasTranslations,
  SahajaGlossary,
  WeMeditateAppConfig,
  WeMeditateAppStatus,
  WeMeditateAppTranslations,
  WeMeditateWebConfig,
  WeMeditateWebTranslations,
}
