import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers" ALTER COLUMN "current_project" SET DATA TYPE text;
  UPDATE "managers" SET "current_project" = NULL WHERE "current_project" = '';
  DROP TYPE "public"."enum_managers_current_project";
  CREATE TYPE "public"."enum_managers_current_project" AS ENUM('wemeditate-web', 'wemeditate-app', 'sahaj-atlas');
  ALTER TABLE "managers" ALTER COLUMN "current_project" SET DATA TYPE "public"."enum_managers_current_project" USING "current_project"::"public"."enum_managers_current_project";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_managers_current_project" ADD VALUE '' BEFORE 'wemeditate-web';`)
}
