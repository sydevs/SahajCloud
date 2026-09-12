import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "seo" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_seo" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "seo";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_seo";`)
}
