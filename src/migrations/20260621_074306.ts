import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_managers_roles" ADD VALUE 'atlas-manager';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_managers_roles";
  CREATE TYPE "public"."enum_managers_roles" AS ENUM('meditations-editor', 'path-editor', 'web-translator');
  ALTER TABLE "managers_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_managers_roles" USING "value"::"public"."enum_managers_roles";`)
}
