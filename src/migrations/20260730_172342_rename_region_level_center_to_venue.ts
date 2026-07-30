import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE text;
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::text;
  DROP TYPE "public"."enum_regions_level";
  CREATE TYPE "public"."enum_regions_level" AS ENUM('country', 'region', 'city', 'venue');
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::"public"."enum_regions_level";
  ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE "public"."enum_regions_level" USING "level"::"public"."enum_regions_level";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE text;
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::text;
  DROP TYPE "public"."enum_regions_level";
  CREATE TYPE "public"."enum_regions_level" AS ENUM('country', 'region', 'city', 'center');
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::"public"."enum_regions_level";
  ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE "public"."enum_regions_level" USING "level"::"public"."enum_regions_level";`)
}
