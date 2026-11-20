import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "published_to_web" boolean DEFAULT true;
  ALTER TABLE "pages" ADD COLUMN "published_to_app" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_published_to_web" boolean DEFAULT true;
  ALTER TABLE "_pages_v" ADD COLUMN "version_published_to_app" boolean DEFAULT false;
  CREATE INDEX "pages_published_to_web_idx" ON "pages" USING btree ("published_to_web");
  CREATE INDEX "pages_published_to_app_idx" ON "pages" USING btree ("published_to_app");
  CREATE INDEX "_pages_v_version_version_published_to_web_idx" ON "_pages_v" USING btree ("version_published_to_web");
  CREATE INDEX "_pages_v_version_version_published_to_app_idx" ON "_pages_v" USING btree ("version_published_to_app");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "pages_published_to_web_idx";
  DROP INDEX "pages_published_to_app_idx";
  DROP INDEX "_pages_v_version_version_published_to_web_idx";
  DROP INDEX "_pages_v_version_version_published_to_app_idx";
  ALTER TABLE "pages" DROP COLUMN "published_to_web";
  ALTER TABLE "pages" DROP COLUMN "published_to_app";
  ALTER TABLE "_pages_v" DROP COLUMN "version_published_to_web";
  ALTER TABLE "_pages_v" DROP COLUMN "version_published_to_app";`)
}
