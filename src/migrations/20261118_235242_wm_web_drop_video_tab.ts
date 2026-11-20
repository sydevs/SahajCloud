import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// WeMeditate Web's `video` tab goes, with the 41 keys describing a video player's controls
// (sydevs/WeMeditateWeb#242): the site moved to a player that ships its own control labels in
// every launch language, so nothing can ever fill them.
//
// ⚠ **The 41 English values are discarded, and nothing restores them.** Dropping a column takes
// its stored values with it, and the down migration re-adds four empty ones. English was the only
// populated locale — the seed writes and publishes English alone for this global — and no editor
// ever typed into this tab.
//
// This is a whole tab, so it is generated DDL and not the JSONB key-retirement trap in
// `src/globals/AGENTS.md`: with the columns gone, `additionalProperties: false` never sees an
// undeclared key, so no sweep of the stored values belongs here.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" DROP COLUMN "video_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "video_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_video_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_video_a11y";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" ADD COLUMN "video_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "video_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_video_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_video_a11y" jsonb;`)
}
