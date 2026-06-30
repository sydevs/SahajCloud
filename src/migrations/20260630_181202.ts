import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "regions_breadcrumbs_locale_idx";
  ALTER TABLE "regions_breadcrumbs" DROP COLUMN "_locale";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "regions_breadcrumbs" ADD COLUMN "_locale" "_locales" NOT NULL;
  CREATE INDEX "regions_breadcrumbs_locale_idx" ON "regions_breadcrumbs" USING btree ("_locale");`)
}
