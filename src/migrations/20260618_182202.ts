import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "regions" ADD COLUMN "generate_slug" boolean DEFAULT false;
  ALTER TABLE "regions" ADD COLUMN "slug" varchar;
  CREATE UNIQUE INDEX "regions_slug_idx" ON "regions" USING btree ("slug");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "regions_slug_idx";
  ALTER TABLE "regions" DROP COLUMN "generate_slug";
  ALTER TABLE "regions" DROP COLUMN "slug";`)
}
