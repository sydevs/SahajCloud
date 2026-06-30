import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "regions_breadcrumbs_locale_idx";
  ALTER TABLE "regions_breadcrumbs" DROP COLUMN "_locale";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Hand-edited: the generated down() re-added `_locale` NOT NULL with no
  // default, which fails on a non-empty table. Add it with a temporary
  // DEFAULT so existing breadcrumb rows satisfy NOT NULL (canonical locale is
  // 'en'), then drop the default to match the original schema.
  await db.execute(sql`
   ALTER TABLE "regions_breadcrumbs" ADD COLUMN "_locale" "_locales" NOT NULL DEFAULT 'en';
  ALTER TABLE "regions_breadcrumbs" ALTER COLUMN "_locale" DROP DEFAULT;
  CREATE INDEX "regions_breadcrumbs_locale_idx" ON "regions_breadcrumbs" USING btree ("_locale");`)
}
