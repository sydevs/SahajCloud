import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// WeMeditate Web is building a mood finder on "Meditate now" (#1223, for
// sydevs/WeMeditateWeb#272). It ships the English strings that work reads, which the seed reaches
// only on a fresh database.
//
// ⚠ **Six rows for five declared keys.** `mood_meditation_label` is `plural: true`, and the
// column holds the expanded CLDR family — nothing expands it at migration time, so English's
// `_one` and `_other` are written out.
//
// ⚠ **`up` never overwrites a word somebody chose.** Each key lands only where English lacks it.
// Of the versions, only the `latest: true` row gets it: a global's update loads the document it
// changes from that row.
//
// ⚠ **`down` drops all eight, whatever they hold** — the six `up` writes plus the plural family's
// `_few` and `_many`, which other locales store. The previous schema declares none of them, and
// a stored undeclared key makes `additionalProperties: false` refuse every later save of the
// global (`src/globals/AGENTS.md`).

const MEDITATION_GENERAL = { main: 'meditation_general', version: 'version_meditation_general' }
const MEDITATION_A11Y = { main: 'meditation_a11y', version: 'version_meditation_a11y' }

const ADDED = [
  { group: MEDITATION_GENERAL, key: 'finder_question', en: 'How are you feeling?' },
  {
    group: MEDITATION_GENERAL,
    key: 'finder_unavailable',
    en: "We can't load the meditations just now. Please try again shortly.",
  },
  { group: MEDITATION_GENERAL, key: 'all_meditations', en: 'All meditations' },
  { group: MEDITATION_GENERAL, key: 'mood_meditation_label_one', en: '%{mood} · %{count} min' },
  { group: MEDITATION_GENERAL, key: 'mood_meditation_label_other', en: '%{mood} · %{count} min' },
  { group: MEDITATION_A11Y, key: 'finder_region', en: 'Choose how you feel' },
]

// `down` sweeps wider than `up` wrote. `mood_meditation_label` is `plural: true`, so `_few` and
// `_many` are legal storage keys too — the Russian, Ukrainian and Czech seeds write them, and so
// does the admin's grouped plural row. The previous schema declares none of the family, and one
// stored undeclared key refuses every later save of the global.
const DROPPED = [
  ...ADDED.map(({ group, key }) => ({ group, key })),
  { group: MEDITATION_GENERAL, key: 'mood_meditation_label_few' },
  { group: MEDITATION_GENERAL, key: 'mood_meditation_label_many' },
]

type Db = MigrateUpArgs['db']
type Group = typeof MEDITATION_GENERAL

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
  for (const { group, key } of DROPPED) await dropKey(db, group, key)
}
