import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// WeMeditate Web's new-tab warning moves to one key (#1196): it ships the English
// `opens_in_new_tab_suffix`, which the seed reaches only on a fresh database, and retires the
// `%{label}` sentence form `opens_in_new_tab`. A retired key left stored refuses every later save
// of the global (`src/globals/AGENTS.md`), so it is dropped from every locale and version row.
//
// ⚠ **Deploy only after sydevs/WeMeditateWeb#260.** Until that ships, its aria-label path still
// reads `opens_in_new_tab`.
//
// ⚠ **`up` never overwrites a word somebody chose.** The new key lands only where English lacks
// it. Of the versions, only the `latest: true` row gets it: a global's update loads the document
// it changes from that row.
//
// ⚠ **`down` sweeps wider than `up` wrote.** The previous schema does not declare the suffix, so it
// leaves every locale and version row, whatever it holds. The retired key comes back in English
// only — the other locales' translations of it are not recoverable.

const COMMON_A11Y = { main: 'common_a11y', version: 'version_common_a11y' }

const SUFFIX = 'opens_in_new_tab_suffix'
const SUFFIX_EN = '(opens in new tab)'
const RETIRED = 'opens_in_new_tab'
const RETIRED_EN = '%{label} (opens in new tab)'

type Db = MigrateUpArgs['db']

const targets = [
  { table: 'wm_web_translations_locales', column: COMMON_A11Y.main, latestOnly: false },
  { table: '_wm_web_translations_v_locales', column: COMMON_A11Y.version, latestOnly: true },
]

const latestOnly = (on: boolean) =>
  on
    ? sql`AND "_parent_id" IN (SELECT "id" FROM "_wm_web_translations_v" WHERE "latest")`
    : sql``

/**
 * Adds `key` where English lacks it. `jsonb_typeof` keeps a scalar column out: `||` on a
 * scalar builds an array, which would void the whole group.
 */
async function addKey(db: Db, key: string, value: string): Promise<void> {
  for (const t of targets) {
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
async function dropKey(db: Db, key: string): Promise<void> {
  for (const t of targets) {
    const col = sql.identifier(t.column)
    await db.execute(sql`
      UPDATE ${sql.identifier(t.table)}
        SET ${col} = ${col} - ${key}::text
        WHERE jsonb_typeof(${col}) = 'object'
          AND ${col} ? ${key}::text`)
  }
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addKey(db, SUFFIX, SUFFIX_EN)
  await dropKey(db, RETIRED)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await dropKey(db, SUFFIX)
  await addKey(db, RETIRED, RETIRED_EN)
}
