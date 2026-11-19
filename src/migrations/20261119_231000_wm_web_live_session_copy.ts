import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// The eight keys WeMeditate Web's live-session panel reads (#1228): `blocks.general.days` for
// the countdown's new days cell, and the whole `blocks.live_session` group. The column the
// second lands in is created by the migration before this one. The seed reaches only a fresh
// database, and `src/lib/translations/clientEnglishFallback.ts` fills a blank key for a client
// read *from English*, so English must actually hold them.
//
// ⚠ **`up` never overwrites a word somebody chose.** A key lands only where English lacks it.
// Of the versions, only the `latest: true` row gets it: a global's update loads the document it
// changes from that row.
//
// ⚠ **`down` sweeps wider than `up` wrote.** The previous schema declares none of these keys, so
// a value left in any locale or version row refuses every later save of the global
// (`src/globals/AGENTS.md`).

const COLUMNS = {
  general: { main: 'blocks_general', version: 'version_blocks_general' },
  liveSession: { main: 'blocks_live_session', version: 'version_blocks_live_session' },
}

const GENERAL_EN: Record<string, string> = {
  days: 'Days',
}

const LIVE_SESSION_EN: Record<string, string> = {
  next_session: 'Next session',
  starts_in: 'Starts in',
  join_now: 'Join now',
  live_now: 'Happening now',
  no_upcoming: 'No upcoming session',
  schedule_line: '%{weekday}, %{time} %{zone}',
  a11y_next_session: 'The next session is %{weekday} at %{time}, %{relative}.',
}

type Db = MigrateUpArgs['db']
type Column = { main: string; version: string }

const targets = (column: Column) => [
  { table: 'wm_web_translations_locales', column: column.main, latestOnly: false },
  { table: '_wm_web_translations_v_locales', column: column.version, latestOnly: true },
]

const latestOnly = (on: boolean) =>
  on
    ? sql`AND "_parent_id" IN (SELECT "id" FROM "_wm_web_translations_v" WHERE "latest")`
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
 * scalar column out: `-` on one raises `cannot delete from scalar`, aborting the boot migration.
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
  for (const [key, value] of Object.entries(GENERAL_EN)) {
    await addKey(db, COLUMNS.general, key, value)
  }
  for (const [key, value] of Object.entries(LIVE_SESSION_EN)) {
    await addKey(db, COLUMNS.liveSession, key, value)
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const key of Object.keys(GENERAL_EN)) {
    await dropKey(db, COLUMNS.general, key)
  }
  for (const key of Object.keys(LIVE_SESSION_EN)) {
    await dropKey(db, COLUMNS.liveSession, key)
  }
}
