import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_meditation_transcripts_status" AS ENUM('queued', 'processing', 'completed', 'failed');
  CREATE TYPE "public"."enum_meditation_transcripts_provider" AS ENUM('lemonfox');
  CREATE TYPE "public"."enum_meditation_transcripts_language" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TABLE "meditation_transcripts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"meditation_id" integer,
  	"status" "enum_meditation_transcripts_status" DEFAULT 'queued' NOT NULL,
  	"audio_filename" varchar,
  	"provider" "enum_meditation_transcripts_provider",
  	"language" "enum_meditation_transcripts_language",
  	"outdated" boolean DEFAULT false,
  	"segments" jsonb,
  	"error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "meditation_transcripts_id" integer;
  ALTER TABLE "meditation_transcripts" ADD CONSTRAINT "meditation_transcripts_meditation_id_meditations_id_fk" FOREIGN KEY ("meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "meditation_transcripts_meditation_idx" ON "meditation_transcripts" USING btree ("meditation_id");
  CREATE INDEX "meditation_transcripts_updated_at_idx" ON "meditation_transcripts" USING btree ("updated_at");
  CREATE INDEX "meditation_transcripts_created_at_idx" ON "meditation_transcripts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meditation_transcripts_fk" FOREIGN KEY ("meditation_transcripts_id") REFERENCES "public"."meditation_transcripts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_meditation_transcripts_id_idx" ON "payload_locked_documents_rels" USING btree ("meditation_transcripts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "meditation_transcripts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "meditation_transcripts" CASCADE;

  DROP INDEX "payload_locked_documents_rels_meditation_transcripts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "meditation_transcripts_id";
  DROP TYPE "public"."enum_meditation_transcripts_status";
  DROP TYPE "public"."enum_meditation_transcripts_provider";
  DROP TYPE "public"."enum_meditation_transcripts_language";`)
}
