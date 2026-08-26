import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_user_messages_status" AS ENUM('screening', 'delivered', 'spam', 'failed');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purgeUserMessages' BEFORE 'screenEventSubmission';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'screenUserMessage' BEFORE 'sendPostEventFollowUps';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purgeUserMessages' BEFORE 'screenEventSubmission';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'screenUserMessage' BEFORE 'sendPostEventFollowUps';
  CREATE TABLE "user_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"screening_result" jsonb,
  	"subject" varchar DEFAULT 'Message',
  	"message" varchar NOT NULL,
  	"sender_email" varchar,
  	"context" jsonb,
  	"client_id" integer,
  	"user_id" integer,
  	"status" "enum_user_messages_status" DEFAULT 'screening' NOT NULL,
  	"body_hash" varchar,
  	"delivered_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_messages_id" integer;
  ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "user_messages_sender_email_idx" ON "user_messages" USING btree ("sender_email");
  CREATE INDEX "user_messages_client_idx" ON "user_messages" USING btree ("client_id");
  CREATE INDEX "user_messages_user_idx" ON "user_messages" USING btree ("user_id");
  CREATE INDEX "user_messages_body_hash_idx" ON "user_messages" USING btree ("body_hash");
  CREATE INDEX "user_messages_updated_at_idx" ON "user_messages" USING btree ("updated_at");
  CREATE INDEX "user_messages_created_at_idx" ON "user_messages" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_messages_fk" FOREIGN KEY ("user_messages_id") REFERENCES "public"."user_messages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_user_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("user_messages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_messages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "user_messages" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_messages_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'screenEventSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'expireEvents', 'screenEventSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_user_messages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "user_messages_id";
  DROP TYPE "public"."enum_user_messages_status";`)
}
