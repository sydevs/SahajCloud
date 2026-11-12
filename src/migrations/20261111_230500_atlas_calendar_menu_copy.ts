import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// The two English sub-labels the Sahaj Atlas "Add to calendar" menu needs once its rows
// subscribe rather than download (sydevs/SahajAtlasWeb#393): one for a row that keeps the class
// up to date by itself, one for a row that can only add the next session. Shipped with the code
// because the seed files reach a fresh database alone, so in production both keys would
// otherwise stay blank until somebody typed them into the admin. English only: a locale that
// omits a key is merged from English on a client read, and the rest belong to translators.
//
// ⚠ **`up` never overwrites a word somebody chose.** Each key lands only where English lacks it.
//
// Both tables are written, and of the versions only the `latest: true` row: a global's update
// loads the document it changes from that row, so a value left off it is dropped on the next
// save.
//
// ⚠ **`down` is not optional, and it sweeps wider than `up` wrote.** The previous schema
// declares neither key, and a stored key a schema does not declare refuses every save of the row
// holding it (`src/globals/AGENTS.md`) — so `down` drops both from every locale and every version
// row, whatever they hold. A key the old schema cannot hold is not an editor's to keep: sparing a
// reworded one re-arms the failure `down` exists to prevent.

const KEEPS_UPDATED = 'Keeps itself up to date'
const NEXT_SESSION_ONLY = 'Adds the next session only'

type Db = MigrateUpArgs['db']

/** One leaf-group column, as named in the main table and in the versions table. */
type Column = { main: string; version: string }

const EVENT_ACTIONS: Column = { main: 'event_actions', version: 'version_event_actions' }

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
          AND NOT coalesce(${col}, '{}'::jsonb) ? ${key}::text
          ${latestOnly(t.latestOnly)}`)
  }
}

/**
 * Drops `key` from both tables, every locale and every version row. `jsonb_typeof` keeps a
 * scalar column out: `-` on one raises `cannot delete from scalar`, aborting the rollback.
 */
async function dropKey(db: Db, column: Column, key: string): Promise<void> {
  for (const t of targets(column)) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE jsonb_typeof(${col}) = 'object'
          AND ${col} ? ${key}::text`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addKey(db, EVENT_ACTIONS, 'calendar_keeps_updated', KEEPS_UPDATED)
  await addKey(db, EVENT_ACTIONS, 'calendar_next_session_only', NEXT_SESSION_ONLY)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await dropKey(db, EVENT_ACTIONS, 'calendar_keeps_updated')
  await dropKey(db, EVENT_ACTIONS, 'calendar_next_session_only')
}
