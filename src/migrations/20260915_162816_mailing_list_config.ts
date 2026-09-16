import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clients_mailing_list_provider" AS ENUM('mailchimp', 'brevo', 'klaviyo');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'deliverSubmission' BEFORE 'expireEvents';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purgeSubmissions' BEFORE 'purgeUserMessages';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'screenSubmission' BEFORE 'screenUserMessage';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'deliverSubmission' BEFORE 'expireEvents';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purgeSubmissions' BEFORE 'purgeUserMessages';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'screenSubmission' BEFORE 'screenUserMessage';
  ALTER TABLE "clients" ADD COLUMN "mailing_list_enabled" boolean DEFAULT false;
  ALTER TABLE "clients" ADD COLUMN "mailing_list_provider" "enum_clients_mailing_list_provider";
  ALTER TABLE "clients" ADD COLUMN "mailing_list_list_id" varchar;
  ALTER TABLE "clients" ADD COLUMN "mailing_list_api_key" varchar;
  ALTER TABLE "clients" ADD COLUMN "mailing_list_double_opt_in" boolean DEFAULT true;
  ALTER TABLE "_clients_v" ADD COLUMN "version_mailing_list_enabled" boolean DEFAULT false;
  ALTER TABLE "_clients_v" ADD COLUMN "version_mailing_list_provider" "enum_clients_mailing_list_provider";
  ALTER TABLE "_clients_v" ADD COLUMN "version_mailing_list_list_id" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_mailing_list_api_key" varchar;
  ALTER TABLE "_clients_v" ADD COLUMN "version_mailing_list_double_opt_in" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'purgeUserMessages', 'screenEventSubmission', 'screenUserMessage', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'purgeUserMessages', 'screenEventSubmission', 'screenUserMessage', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_enabled";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_provider";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_list_id";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_api_key";
  ALTER TABLE "clients" DROP COLUMN "mailing_list_double_opt_in";
  ALTER TABLE "_clients_v" DROP COLUMN "version_mailing_list_enabled";
  ALTER TABLE "_clients_v" DROP COLUMN "version_mailing_list_provider";
  ALTER TABLE "_clients_v" DROP COLUMN "version_mailing_list_list_id";
  ALTER TABLE "_clients_v" DROP COLUMN "version_mailing_list_api_key";
  ALTER TABLE "_clients_v" DROP COLUMN "version_mailing_list_double_opt_in";
  DROP TYPE "public"."enum_clients_mailing_list_provider";`)
}
