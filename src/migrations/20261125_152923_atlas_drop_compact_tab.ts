/**
 * Dropping the atlas `compact` tab discards every locale's stored
 * `compact.open`, and the down migration restores the two columns empty.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "compact";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_compact";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "compact" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_compact" jsonb;`)
}
