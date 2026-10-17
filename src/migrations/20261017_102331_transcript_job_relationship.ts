import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "meditation_transcripts" ADD COLUMN "job_id" integer;
  ALTER TABLE "meditation_transcripts" ADD CONSTRAINT "meditation_transcripts_job_id_payload_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "meditation_transcripts_job_idx" ON "meditation_transcripts" USING btree ("job_id");
  ALTER TABLE "meditation_transcripts" DROP COLUMN "status";
  ALTER TABLE "meditation_transcripts" DROP COLUMN "outdated";
  ALTER TABLE "meditation_transcripts" DROP COLUMN "error";
  DROP TYPE "public"."enum_meditation_transcripts_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_meditation_transcripts_status" AS ENUM('queued', 'processing', 'completed', 'failed');
  ALTER TABLE "meditation_transcripts" DROP CONSTRAINT "meditation_transcripts_job_id_payload_jobs_id_fk";
  
  DROP INDEX "meditation_transcripts_job_idx";
  ALTER TABLE "meditation_transcripts" ADD COLUMN "status" "enum_meditation_transcripts_status" DEFAULT 'queued' NOT NULL;
  ALTER TABLE "meditation_transcripts" ADD COLUMN "outdated" boolean DEFAULT false;
  ALTER TABLE "meditation_transcripts" ADD COLUMN "error" varchar;
  ALTER TABLE "meditation_transcripts" DROP COLUMN "job_id";`)
}
