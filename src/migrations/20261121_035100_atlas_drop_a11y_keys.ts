import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Sahaj Atlas's thirteen screen-reader-only keys leave `sy-atlas-translations`: the widget now
// owns them (sydevs/SahajAtlasWeb src/config/a11y/), machine-translated there under new names.
// Their groups keep other keys, so the columns stay and the keys are swept out of the stored
// values instead — the schema declares `additionalProperties: false`, so a key left in any locale
// or version row refuses every later save of the global (`src/globals/AGENTS.md`).
//
// ⚠ **Every locale's value is discarded.** The down migration restores English alone, where it
// is absent: the previous schema declares the keys but requires none, and a client read fills
// the other locales from English.

type Db = MigrateUpArgs['db']

/** Each retired key, the leaf group column holding it, and its English. */
const RETIRED = [
  { column: 'calendar', key: 'previous', en: 'Previous' },
  { column: 'calendar', key: 'next', en: 'Next' },
  { column: 'calendar', key: 'pick_date', en: 'Pick a date' },
  { column: 'common_chrome', key: 'explore', en: 'Explore' },
  { column: 'common_chrome', key: 'loading', en: 'Loading…' },
  { column: 'common_settings', key: 'title', en: 'Settings' },
  { column: 'event_actions', key: 'view_photo', en: 'View photo' },
  { column: 'event_actions', key: 'pause_slideshow', en: 'Pause slideshow' },
  { column: 'filters_chrome', key: 'remove', en: 'Remove %{label}' },
  { column: 'search_results', key: 'showing', en: 'Showing %{shown} of %{total} events' },
  { column: 'search_nearby_prompt', key: 'dismiss', en: 'Dismiss' },
  { column: 'share', key: 'share_on', en: 'Share on %{platform}' },
  { column: 'share', key: 'copy_link', en: 'Copy link' },
]

const TABLES = [
  { table: 'sy_atlas_translations_locales', prefix: '', latestOnly: false },
  { table: '_sy_atlas_translations_v_locales', prefix: 'version_', latestOnly: true },
]

const latestOnly = (on: boolean) =>
  on
    ? sql`AND "_parent_id" IN (SELECT "id" FROM "_sy_atlas_translations_v" WHERE "latest")`
    : sql``

/**
 * Drops `key` from both tables, every locale and every version row. `jsonb_typeof` keeps a
 * scalar column out: `-` on one raises `cannot delete from scalar`, aborting the boot migration.
 */
async function dropKey(db: Db, column: string, key: string): Promise<void> {
  for (const t of TABLES) {
    const col = sql.identifier(`${t.prefix}${column}`)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE jsonb_typeof(${col}) = 'object'
          AND ${col} ? ${key}::text`)
  }
}

/**
 * Adds `key` where English lacks it. `jsonb_typeof` keeps a scalar column out: `||` on a
 * scalar builds an array, which would void the whole group.
 */
async function addKey(db: Db, column: string, key: string, value: string): Promise<void> {
  for (const t of TABLES) {
    const col = sql.identifier(`${t.prefix}${column}`)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = coalesce(${col}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${value}::text)
        WHERE "_locale" = 'en'
          AND jsonb_typeof(coalesce(${col}, '{}'::jsonb)) = 'object'
          AND NOT coalesce(${col}, '{}'::jsonb) ? ${key}::text
          ${latestOnly(t.latestOnly)}`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { column, key } of RETIRED) await dropKey(db, column, key)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const { column, key, en } of RETIRED) await addKey(db, column, key, en)
}
