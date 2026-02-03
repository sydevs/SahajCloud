// Field factories for this project - not intended for external use
// All exports use camelCase naming convention

// Media field - standardized media upload with ThumbnailCell component
export { mediaField } from './mediaField'
export type { MediaFieldOptions } from './mediaField'

// URL field - text field with URL validation
export { urlField } from './urlField'
export type { UrlFieldOptions } from './urlField'

// Color field - text field with hex color validation and color picker
export { colorField } from './colorField'
export type { ColorFieldOptions } from './colorField'

// Slug field - wrapper around Payload's slugField with simplified description handling
export { slugField } from './slugField'
export type { SlugFieldOptions } from './slugField'

// Translations field - builds tabs from nested JSON schema for translations
export { buildTranslationTabs } from './translationsField'
export type { SchemaEntry, TranslationsSchema } from './translationsField'

// Event Timing field - JSON field with datetime, timezone, and RRULE support
export { eventTimingField } from './eventTimingField'
export type { EventTimingFieldOptions } from './eventTimingField'
