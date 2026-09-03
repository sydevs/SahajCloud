/**
 * Database Errors Plugin
 *
 * Turns a Postgres cast failure (SQLSTATE 22P02) into a 400 naming the
 * offending value, instead of an unhandled 500.
 *
 * @example
 * ```typescript
 * import { databaseErrorPlugin } from '@/plugins/databaseErrors'
 *
 * plugins: [
 *   databaseErrorPlugin(),
 * ]
 * ```
 */

export { databaseErrorPlugin } from './databaseErrorPlugin'
