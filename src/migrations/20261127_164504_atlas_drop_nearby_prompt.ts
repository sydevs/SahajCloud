/**
 * Dropping the atlas `search.nearby_prompt` group discards every locale's stored
 * prompt copy, and the down migration restores the two columns empty.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "search_nearby_prompt";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_search_nearby_prompt";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "search_nearby_prompt" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_search_nearby_prompt" jsonb;`)
}
