export { mediaField } from './mediaField'
export type { MediaFieldOptions } from './mediaField'

export { urlField } from './urlField'
export type { UrlFieldOptions } from './urlField'

export { publicUrlFields } from './publicUrlFields'
export type {
  PublicUrlFieldContext,
  PublicUrlFieldsOptions,
  PublicUrlPlatform,
} from './publicUrlFields'

export { fileMetadataField } from './fileMetadataField'

// jsonField is deliberately NOT re-exported here. Importing it via this
// barrel would drag translationsField (and the lexical editor with it) into
// every light module that declares a JSON column. Use the deep path
// `@/fields/jsonField`, as all its call sites do.

export { colorField } from './colorField'
export type { ColorFieldOptions } from './colorField'

export { slugField } from './slugField'
export type { SlugFieldOptions } from './slugField'

// translationsField is deliberately NOT re-exported here, for the reason
// jsonField is not: it imports the lexical editor, so the barrel would drag
// that graph into every light module taking a field from it. Use the deep path
// `@/fields/translationsField`, as all its call sites do.

export { availableLocalesField, SKIP_AVAILABLE_LOCALES_CHECK } from './availableLocalesField'
export type { AvailableLocalesFieldOptions } from './availableLocalesField'

export {
  asLog,
  DEFAULT_LOG_LIMIT,
  hasLogEntry,
  hasLogEntryType,
  logField,
  toLogRow,
} from './logField'
export type { LogCell, LogColumn, LogEntry, LogFieldOptions, LogRow } from './logField'

export { scheduleFields } from './scheduleFields'
export { systemMetaField } from './systemMetaField'
export type { ScheduleFieldsOptions } from './scheduleFields'

export { addressFields } from './addressFields'
export type { AddressFieldsOptions } from './addressFields'

export { legacyMigrationFields } from './legacyFields'

export { hideUntilCreated } from './hideUntilCreated'

// `secretFieldEndpoints` is deliberately NOT re-exported here: the routes reach
// server-only code, so a collection imports them by deep path.
export { secretField } from './secretField'
export type { SecretFieldOptions, SecretVerifyArgs } from './secretField'
