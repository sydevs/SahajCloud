import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Retiring `time_in_place` from `translationsSchema.json` (#1057) leaves the key
// in the `event_display` column that stored it, where it refuses every later
// save of the global. `src/globals/AGENTS.md` owns that rule and what a
// retirement costs. The versions table is swept too, because a global's update
// loads the document it is about to change from the `latest: true` row.
//
// ⚠ **The `?` guard is load-bearing, not an optimization over ~20 rows.**
// `jsonb - text` raises `cannot delete from scalar` on a column holding a
// non-object, which would abort the whole boot migration; `jsonb ? text`
// answers false there, so such a row is skipped instead. A scalar can be
// stored at all because the built-in json validator short-circuits on an
// "empty" value. Same hazard `20260909_161353_atlas_translations_by_view`
// guards with `jsonb_typeof`.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "sy_atlas_translations_locales"
      SET "event_display" = "event_display" - 'time_in_place'
      WHERE "event_display" ? 'time_in_place';
    UPDATE "_sy_atlas_translations_v_locales"
      SET "version_event_display" = "version_event_display" - 'time_in_place'
      WHERE "version_event_display" ? 'time_in_place';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo. Rolling the code back restores the key to the schema,
  // where a locale that does not store it reads as untranslated — the state
  // every other unfilled key is already in.
}
