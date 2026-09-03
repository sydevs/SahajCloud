/**
 * Database Errors Plugin — turns a Postgres cast failure (SQLSTATE 22P02) into a 400
 * naming the offending value, instead of an unhandled 500. See `databaseErrorPlugin`.
 */

export { databaseErrorPlugin } from './databaseErrorPlugin'
