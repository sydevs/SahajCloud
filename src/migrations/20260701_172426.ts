import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "meditations_locale_idx" ON "meditations" USING btree ("locale");
  CREATE INDEX "_meditations_v_version_version_locale_idx" ON "_meditations_v" USING btree ("version_locale");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "meditations_locale_idx";
  DROP INDEX "_meditations_v_version_version_locale_idx";`)
}
