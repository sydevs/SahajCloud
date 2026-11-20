import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`). Shaped exactly as `20261118_231500_wm_web_a11y_landmark_keys`,
// the many-keys precedent beside it.
//
// WeMeditate Web is adding a live-meditation panel that counts down to the next online class
// (#1228, for sydevs/WeMeditateWeb#271). It ships the eight English strings that work reads,
// which the seed reaches only on a fresh database. `blocks_live_session` is created by the
// migration before this one.
//
// ⚠ **`up` never overwrites a word somebody chose.** Each key lands only where English lacks it.
// Of the versions, only the `latest: true` row gets it: a global's update loads the document it
// changes from that row.
//
// ⚠ **`down` drops all eight, whatever they hold.** The previous schema declares none of them,
// and a stored undeclared key makes `additionalProperties: false` refuse every later save of the
// global (`src/globals/AGENTS.md`).

const BLOCKS_GENERAL = { main: 'blocks_general', version: 'version_blocks_general' }
const BLOCKS_LIVE_SESSION = { main: 'blocks_live_session', version: 'version_blocks_live_session' }

const ADDED = [
  { group: BLOCKS_GENERAL, key: 'days', en: 'Days' },
  { group: BLOCKS_LIVE_SESSION, key: 'next_session', en: 'Next session' },
  { group: BLOCKS_LIVE_SESSION, key: 'starts_in', en: 'Starts in' },
  { group: BLOCKS_LIVE_SESSION, key: 'join_now', en: 'Join now' },
  { group: BLOCKS_LIVE_SESSION, key: 'live_now', en: 'Happening now' },
  { group: BLOCKS_LIVE_SESSION, key: 'no_upcoming', en: 'No upcoming session' },
  { group: BLOCKS_LIVE_SESSION, key: 'schedule_line', en: '%{weekday}, %{time} %{zone}' },
  {
    group: BLOCKS_LIVE_SESSION,
    key: 'a11y_next_session',
    en: 'The next session is %{weekday} at %{time}, %{relative}.',
  },
]

type Db = MigrateUpArgs['db']
type Group = typeof BLOCKS_GENERAL

const targets = (group: Group) => [
  { table: 'wm_web_translations_locales', column: group.main, latestOnly: false },
  { table: '_wm_web_translations_v_locales', column: group.version, latestOnly: true },
]

const latestOnly = (on: boolean) =>
  on
    ? sql`AND "_parent_id" IN (SELECT "id" FROM "_wm_web_translations_v" WHERE "latest")`
    : sql``

/**
 * Adds `key` where English lacks it. `jsonb_typeof` keeps a scalar column out: `||` on a
 * scalar builds an array, which would void the whole group.
 */
async function addKey(db: Db, group: Group, key: string, value: string): Promise<void> {
  for (const t of targets(group)) {
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
 * Drops `key` from both tables, every locale and every version row. `? key` is what keeps a
 * scalar column out — it is false for every scalar, so the delete, which would raise
 * `cannot delete from scalar` there, never reaches one (`src/globals/AGENTS.md`).
 */
async function dropKey(db: Db, group: Group, key: string): Promise<void> {
  for (const t of targets(group)) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE ${col} ? ${key}::text`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { group, key, en } of ADDED) await addKey(db, group, key, en)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { group, key } of ADDED) await dropKey(db, group, key)
}
