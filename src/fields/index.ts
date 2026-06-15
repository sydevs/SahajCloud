// Field factories for this project - not intended for external use
// All exports use camelCase naming convention

// Media field - standardized media upload with ThumbnailCell component
export { mediaField } from './mediaField'
export type { MediaFieldOptions } from './mediaField'

// URL field - text field with URL validation
export { urlField } from './urlField'
export type { UrlFieldOptions } from './urlField'

// Public URL fields - virtual webUrl/appUrl pair (base + shared path + exposeWhen guard)
export { publicUrlFields } from './publicUrlFields'
export type {
  PublicUrlFieldContext,
  PublicUrlFieldsOptions,
  PublicUrlPlatform,
} from './publicUrlFields'

// Color field - text field with hex color validation and color picker
export { colorField } from './colorField'
export type { ColorFieldOptions } from './colorField'

// Slug field - wrapper around Payload's slugField with simplified description handling
export { slugField } from './slugField'
export type { SlugFieldOptions } from './slugField'

// Translations field - builds tabs from nested JSON schema for translations
export { buildTranslationTabs } from './translationsField'
export type { SchemaEntry, TranslationsSchema } from './translationsField'

// Schedule fields - group of datetime, timezone, and RRULE sub-fields
export { scheduleFields } from './scheduleFields'
export type { ScheduleFieldsOptions } from './scheduleFields'

// Address fields - group of postal-address sub-fields with country/region dropdowns
export { addressFields } from './addressFields'
export type { AddressFieldsOptions } from './addressFields'

// Legacy migration fields - hidden legacyId + legacyData for the Atlas import
export { legacyMigrationFields } from './legacyFields'
