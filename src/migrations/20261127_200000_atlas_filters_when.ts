import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_when" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_when" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_when";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_when";`)
}
