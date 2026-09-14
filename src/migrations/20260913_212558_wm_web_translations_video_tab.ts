import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Add the `video` tab's two leaf groups to `wm-web-translations` (#775).
 *
 * ⚠ **The generated delta carried four unrelated tables with it, and they are
 * deliberately not here.** #765's per-locale `_status` move for `pages` and
 * `app-cards` shipped as `20260911_235823_pages_app_cards_localize_status`,
 * but the snapshot committed after it (`20260912_031449`) predates that state,
 * so drizzle re-derives the same DDL on every migration generated since. Re-run
 * on production it would fail on a column that already exists. Only the four
 * `wm_web_translations` statements below are this migration's own work. The
 * `.json` snapshot beside this file DOES carry the `pages` / `app-cards` state,
 * which is what stops the next migration re-deriving it again.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" ADD COLUMN "video_general" jsonb;
  ALTER TABLE "wm_web_translations_locales" ADD COLUMN "video_a11y" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_video_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_video_a11y" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" DROP COLUMN "video_general";
  ALTER TABLE "wm_web_translations_locales" DROP COLUMN "video_a11y";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_video_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_video_a11y";`)
}
