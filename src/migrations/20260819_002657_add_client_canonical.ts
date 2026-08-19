import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'verifyEmbeds' BEFORE 'resetUsage';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'verifyEmbeds' BEFORE 'resetUsage';
  ALTER TABLE "clients" ADD COLUMN "canonical_enabled" boolean DEFAULT false;
  ALTER TABLE "clients" ADD COLUMN "canonical_embed" varchar;
  ALTER TABLE "clients" ADD COLUMN "canonical_verification" jsonb;
  ALTER TABLE "clients" ADD COLUMN "canonical_next_verify_at" timestamp(3) with time zone;
  ALTER TABLE "clients" ADD COLUMN "embed_metadata" jsonb;
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_enabled" boolean DEFAULT false;
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_embed" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_verification" jsonb;
  ALTER TABLE "_clients_v" ADD COLUMN "version_canonical_next_verify_at" timestamp(3) with time zone;
  ALTER TABLE "_clients_v" ADD COLUMN "version_embed_metadata" jsonb;
  CREATE INDEX "clients_canonical_canonical_next_verify_at_idx" ON "clients" USING btree ("canonical_next_verify_at");
  CREATE INDEX "_clients_v_version_canonical_version_canonical_next_veri_idx" ON "_clients_v" USING btree ("version_canonical_next_verify_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "clients_canonical_canonical_next_verify_at_idx";
  DROP INDEX "_clients_v_version_canonical_version_canonical_next_veri_idx";
  ALTER TABLE "clients" DROP COLUMN "canonical_enabled";
  ALTER TABLE "clients" DROP COLUMN "canonical_embed";
  ALTER TABLE "clients" DROP COLUMN "canonical_verification";
  ALTER TABLE "clients" DROP COLUMN "canonical_next_verify_at";
  ALTER TABLE "clients" DROP COLUMN "embed_metadata";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_enabled";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_embed";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_verification";
  ALTER TABLE "_clients_v" DROP COLUMN "version_canonical_next_verify_at";
  ALTER TABLE "_clients_v" DROP COLUMN "version_embed_metadata";`)
}
