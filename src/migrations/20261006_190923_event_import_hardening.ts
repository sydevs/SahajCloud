import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_event_imports_status" ADD VALUE 'finished';
  ALTER TABLE "events" ADD COLUMN "import_key" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_import_key" varchar;
  ALTER TABLE "event_imports" ADD COLUMN "upload_locale" varchar;
  ALTER TABLE "event_imports" ADD COLUMN "invite_coordinators" boolean DEFAULT false;
  ALTER TABLE "event_imports" ADD COLUMN "lease_token" varchar;
  ALTER TABLE "event_imports" ADD COLUMN "lease_until" timestamp(3) with time zone;
  ALTER TABLE "event_imports" ADD COLUMN "report" jsonb;
  CREATE UNIQUE INDEX "events_import_key_idx" ON "events" USING btree ("import_key");
  CREATE INDEX "_events_v_version_version_import_key_idx" ON "_events_v" USING btree ("version_import_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "event_imports" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "event_imports" ALTER COLUMN "status" SET DEFAULT 'uploaded'::text;
  DROP TYPE "public"."enum_event_imports_status";
  CREATE TYPE "public"."enum_event_imports_status" AS ENUM('uploaded', 'resolved', 'committing');
  ALTER TABLE "event_imports" ALTER COLUMN "status" SET DEFAULT 'uploaded'::"public"."enum_event_imports_status";
  ALTER TABLE "event_imports" ALTER COLUMN "status" SET DATA TYPE "public"."enum_event_imports_status" USING "status"::"public"."enum_event_imports_status";
  DROP INDEX "events_import_key_idx";
  DROP INDEX "_events_v_version_version_import_key_idx";
  ALTER TABLE "events" DROP COLUMN "import_key";
  ALTER TABLE "_events_v" DROP COLUMN "version_import_key";
  ALTER TABLE "event_imports" DROP COLUMN "upload_locale";
  ALTER TABLE "event_imports" DROP COLUMN "invite_coordinators";
  ALTER TABLE "event_imports" DROP COLUMN "lease_token";
  ALTER TABLE "event_imports" DROP COLUMN "lease_until";
  ALTER TABLE "event_imports" DROP COLUMN "report";`)
}
