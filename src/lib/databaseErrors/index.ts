/**
 * Database errors that are the caller's mistake rather than an incident.
 *
 * One cohesive surface, imported as a unit by the plugin that answers with it
 * and by the Sentry plugin that declines to report it.
 */

export type { MappedClientError, PostgresErrorLike } from './postgresCastError'
export {
  findPostgresError,
  INVALID_TEXT_REPRESENTATION,
  mapPostgresCastError,
} from './postgresCastError'
