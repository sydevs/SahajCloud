import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// WeMeditate Web is adding a skip link, an accessible name on each `<nav>` and a page heading on
// every page type (#1212, for sydevs/WeMeditateWeb#162). It ships the four English strings that
// work reads, which the seed reaches only on a fresh database.
//
// ⚠ **`up` never overwrites a word somebody chose.** Each key lands only where English lacks it.
// Of the versions, only the `latest: true` row gets it: a global's update loads the document it
// changes from that row.
//
// ⚠ **`down` drops all four, whatever they hold.** The previous schema declares none of them, and
// a stored undeclared key makes `additionalProperties: false` refuse every later save of the
// global (`src/globals/AGENTS.md`).

const COMMON_GENERAL = { main: 'common_general', version: 'version_common_general' }
const COMMON_A11Y = { main: 'common_a11y', version: 'version_common_a11y' }
const LECTURE_A11Y = { main: 'lecture_a11y', version: 'version_lecture_a11y' }

const ADDED = [
  { group: COMMON_GENERAL, key: 'skip_to_main', en: 'Skip to main content' },
  { group: COMMON_A11Y, key: 'primary_navigation', en: 'Main menu' },
  { group: COMMON_A11Y, key: 'footer_navigation', en: 'Footer menu' },
  { group: LECTURE_A11Y, key: 'untitled_heading', en: 'Untitled talk' },
]

type Db = MigrateUpArgs['db']
type Group = typeof COMMON_GENERAL

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
 * Drops `key` from both tables, every locale and every version row. `jsonb_typeof` keeps a
 * scalar column out: `-` on one raises `cannot delete from scalar`, aborting the boot migration.
 */
async function dropKey(db: Db, group: Group, key: string): Promise<void> {
  for (const t of targets(group)) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE jsonb_typeof(${col}) = 'object'
          AND ${col} ? ${key}::text`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { group, key, en } of ADDED) await addKey(db, group, key, en)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { group, key } of ADDED) await dropKey(db, group, key)
}
