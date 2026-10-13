import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" ADD COLUMN "discover_general" jsonb;
  ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_discover_general" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_web_translations_locales" DROP COLUMN "discover_general";
  ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_discover_general";`)
}
