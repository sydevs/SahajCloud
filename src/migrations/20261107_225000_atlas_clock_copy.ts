import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Four pieces of English Sahaj Atlas copy, shipped with the code rather than typed into the
// admin: the two keys sydevs/SahajAtlasWeb labels a time's clock with, and two rewordings —
// `captcha_blocked` stops blaming "this page", and `privacy_policy` marks its link for the
// widget's `<link>…</link>` span. English only: a locale that omits a key is merged from
// English on a client read, and the rest belong to translators.
//
// ⚠ **An editor's copy always wins.** A new key lands only where English lacks it, and a
// rewording only where the stored value is still the seeded original, so `up` never
// overwrites a word somebody chose.
//
// Both tables are written, and of the versions only the `latest: true` row: a global's
// update loads the document it changes from that row, so a value left off it is dropped
// on the next save.
//
// ⚠ **`down` is not optional.** The previous schema does not declare the two new keys, and
// a stored key a schema does not declare refuses every save of the global
// (`src/globals/AGENTS.md`). So `down` removes them from every locale and every version row,
// whatever they hold — an editor's wording of a key the old schema cannot store is not
// theirs to keep. Only the two rewordings stay guarded on the way back.

const ZONE_TIME = '%{city} time'
const TIMES_NOTE = 'Times are local to each class. Online classes show your time (%{zone}).'

const CAPTCHA_BEFORE = "This Atlas can't run on this page: its security check was blocked."
const CAPTCHA_AFTER =
  "The map can't load here right now, because its security check didn't respond. Try again later."

const PRIVACY_BEFORE =
  'By submitting you confirm you agree to receive follow up messages about this and similar events, in accordance with our privacy policy.'
const PRIVACY_AFTER =
  'By submitting you confirm you agree to receive follow up messages about this and similar events, in accordance with our <link>privacy policy</link>.'

type Db = MigrateUpArgs['db']

/** One leaf-group column, as named in the main table and in the versions table. */
type Column = { main: string; version: string }

const EVENT_DISPLAY: Column = { main: 'event_display', version: 'version_event_display' }
const CALENDAR: Column = { main: 'calendar', version: 'version_calendar' }
const COMMON_ERRORS: Column = { main: 'common_errors', version: 'version_common_errors' }
const REGISTRATION_FORM: Column = {
  main: 'registration_form',
  version: 'version_registration_form',
}

/** English on the main row, and English on the latest version row. */
const targets = (column: Column) => [
  { table: 'sy_atlas_translations_locales', column: column.main, latestOnly: false },
  { table: '_sy_atlas_translations_v_locales', column: column.version, latestOnly: true },
]

const latestOnly = (on: boolean) =>
  on
    ? sql`AND "_parent_id" IN (SELECT "id" FROM "_sy_atlas_translations_v" WHERE "latest")`
    : sql``

/**
 * Adds `key` where English lacks it. `jsonb_typeof` keeps a scalar column out: `||` on a
 * scalar builds an array, which would void the whole group.
 */
async function addKey(db: Db, column: Column, key: string, value: string): Promise<void> {
  for (const t of targets(column)) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = coalesce(${col}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${value}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(coalesce(${col}, '{}'::jsonb)) = 'object'
          AND NOT coalesce(${col}, '{}'::jsonb) ? ${key}
          ${latestOnly(t.latestOnly)}`)
  }
}

/**
 * Removes `key` from every locale and every version row. `?` answers false on a scalar column,
 * where `jsonb - text` would raise and abort the migration.
 */
async function removeKey(db: Db, column: Column, key: string): Promise<void> {
  const tables = [
    ['sy_atlas_translations_locales', column.main],
    ['_sy_atlas_translations_v_locales', column.version],
  ] as const
  for (const [table, name] of tables) {
    const col = sql.identifier(name)
    await db.execute(sql`
      UPDATE ${sql.identifier(table)}
        SET ${col} = ${col} - ${key}::text
        WHERE ${col} ? ${key}`)
  }
}

/** Replaces `key`'s English value with `to`, only where it is still exactly `from`. */
async function reword(
  db: Db,
  column: Column,
  key: string,
  from: string,
  to: string,
): Promise<void> {
  for (const t of targets(column)) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} || jsonb_build_object(${key}::text, ${to}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(${col}) = 'object'
          AND ${col} ->> ${key}::text = ${from}::text
          ${latestOnly(t.latestOnly)}`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addKey(db, EVENT_DISPLAY, 'zone_time', ZONE_TIME)
  await addKey(db, CALENDAR, 'times_note', TIMES_NOTE)
  await reword(db, COMMON_ERRORS, 'captcha_blocked', CAPTCHA_BEFORE, CAPTCHA_AFTER)
  await reword(db, REGISTRATION_FORM, 'privacy_policy', PRIVACY_BEFORE, PRIVACY_AFTER)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await removeKey(db, EVENT_DISPLAY, 'zone_time')
  await removeKey(db, CALENDAR, 'times_note')
  await reword(db, COMMON_ERRORS, 'captcha_blocked', CAPTCHA_AFTER, CAPTCHA_BEFORE)
  await reword(db, REGISTRATION_FORM, 'privacy_policy', PRIVACY_AFTER, PRIVACY_BEFORE)
}
