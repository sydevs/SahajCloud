/**
 * Dropping the atlas `filters.region` group discards every locale's stored
 * region-list copy, and the down migration restores the two columns empty.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_region";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_region";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_region" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_region" jsonb;`)
}
