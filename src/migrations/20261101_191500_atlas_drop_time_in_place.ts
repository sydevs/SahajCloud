import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Data only — no DDL; the `.json` is the prior snapshot re-stamped
// (`src/migrations/AGENTS.md`).
//
// Dropping `time_in_place` from `translationsSchema.json` (#1057) does not
// touch the `event_display` JSON column that stored it, and `event.display`
// declares `additionalProperties: false` — so a stored value still carrying the
// key fails that column's own Ajv check.
//
// Payload merges the stored value into a field the write never mentions and
// validates it, so without this sweep every save of `sy-atlas-translations`
// that does not itself replace `event.display` is refused — in any of the ten
// seeded locales, with "The following field is invalid: Event > Display",
// reported against a tab the editor was not touching. A write that does replace
// the group validates only what it carries, which is why the admin's own Event
// tab looks fine and every other tab is stuck.
//
// The versions table is swept too: a global's update loads the document it is
// about to change from the `latest: true` version row, so a key left there
// comes back on the next save and refuses it again.
//
// ⚠ **The `?` guard is load-bearing, not an optimization over ~20 rows.**
// `jsonb - text` raises `cannot delete from scalar` on a column holding a
// non-object, which would abort the whole boot migration; `jsonb ? text`
// answers false there, so such a row is skipped instead. The built-in json
// validator short-circuits on an "empty" value, which is why a scalar can be
// stored at all — `createStringsJsonField` compensates for the array case only.
// Same hazard `20260909_161353_atlas_translations_by_view` guards with
// `jsonb_typeof`.

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
  // Nothing to undo. Rolling the code back restores the key to the schema, and
  // a locale that does not store it reads as untranslated — the state every
  // other unfilled key is already in. Writing values back would mean carrying
  // ten translations this migration deliberately deleted.
}
