import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'sendInvitations' BEFORE 'schedulePublish';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'sendInvitations' BEFORE 'schedulePublish';
  ALTER TABLE "managers" ALTER COLUMN "notification_preferences" SET DEFAULT '{"invitation":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Immediate","method":"email"},"regional_summary":{"frequency":"Monthly","method":"email"}}'::jsonb;
  ALTER TABLE "managers" ADD COLUMN "pending_invitation" jsonb;
  ALTER TABLE "managers" ADD COLUMN "invitation_due_at" timestamp(3) with time zone;
  CREATE INDEX "managers_invitation_due_at_idx" ON "managers" USING btree ("invitation_due_at");`)

  // `new_responsibility` is now `invitation` (#839). Carry each manager's
  // stored choice across, so nobody who chose "Never" starts receiving them.
  await db.execute(sql`
  UPDATE "managers"
  SET "notification_preferences" = ("notification_preferences" - 'new_responsibility')
    || jsonb_build_object('invitation', "notification_preferences" -> 'new_responsibility')
  WHERE ("notification_preferences" -> 'new_responsibility') IS NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  UPDATE "managers"
  SET "notification_preferences" = ("notification_preferences" - 'invitation')
    || jsonb_build_object('new_responsibility', "notification_preferences" -> 'invitation')
  WHERE ("notification_preferences" -> 'invitation') IS NOT NULL;`)

  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "managers_invitation_due_at_idx";
  ALTER TABLE "managers" ALTER COLUMN "notification_preferences" SET DEFAULT '{"new_responsibility":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Immediate","method":"email"},"regional_summary":{"frequency":"Monthly","method":"email"}}'::jsonb;
  ALTER TABLE "managers" DROP COLUMN "pending_invitation";
  ALTER TABLE "managers" DROP COLUMN "invitation_due_at";`)
}
