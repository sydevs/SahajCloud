import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" ADD COLUMN "blocks_live_session" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_blocks_live_session" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" DROP COLUMN "blocks_live_session";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_blocks_live_session";`)
}
