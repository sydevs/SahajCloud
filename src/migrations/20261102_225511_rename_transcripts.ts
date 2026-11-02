import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * ⚠ **Hand-written over the generator's output, because that output dropped the
 * table.** `meditation_transcripts` → `transcripts` is a rename, and
 * `meditation_id` becomes a row in a new `transcripts_rels` table rather than a
 * column — so the generator saw an unrelated table plus an unrelated column and
 * answered `create` for both, which would have taken all 122 production
 * transcripts with it. Every name below is the generator's own; only the
 * statements that would lose data are replaced.
 *
 * The order in `up()` is load-bearing: the rels rows are inserted while
 * `meditation_id` still holds them, and the column goes afterwards.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_meditation_transcripts_provider" RENAME TO "enum_transcripts_provider";
  ALTER TYPE "public"."enum_meditation_transcripts_language" RENAME TO "enum_transcripts_language";
  ALTER TABLE "meditation_transcripts" RENAME TO "transcripts";
  ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "meditation_transcripts_id" TO "transcripts_id";
  ALTER TABLE "transcripts" DROP CONSTRAINT "meditation_transcripts_job_id_payload_jobs_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_meditation_transcripts_fk";

  DROP INDEX "meditation_transcripts_job_idx";
  DROP INDEX "meditation_transcripts_updated_at_idx";
  DROP INDEX "meditation_transcripts_created_at_idx";
  DROP INDEX "payload_locked_documents_rels_meditation_transcripts_id_idx";
  CREATE TABLE "transcripts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"meditations_id" integer,
  	"files_id" integer
  );

  INSERT INTO "transcripts_rels" ("parent_id", "path", "meditations_id") SELECT "id", 'source', "meditation_id" FROM "transcripts" WHERE "meditation_id" IS NOT NULL;
  ALTER TABLE "transcripts" DROP CONSTRAINT "meditation_transcripts_meditation_id_meditations_id_fk";

  DROP INDEX "meditation_transcripts_meditation_idx";
  ALTER TABLE "transcripts" DROP COLUMN "meditation_id";
  ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_job_id_payload_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcripts_rels" ADD CONSTRAINT "transcripts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transcripts_rels" ADD CONSTRAINT "transcripts_rels_meditations_fk" FOREIGN KEY ("meditations_id") REFERENCES "public"."meditations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transcripts_rels" ADD CONSTRAINT "transcripts_rels_files_fk" FOREIGN KEY ("files_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "transcripts_job_idx" ON "transcripts" USING btree ("job_id");
  CREATE INDEX "transcripts_updated_at_idx" ON "transcripts" USING btree ("updated_at");
  CREATE INDEX "transcripts_created_at_idx" ON "transcripts" USING btree ("created_at");
  CREATE INDEX "transcripts_rels_order_idx" ON "transcripts_rels" USING btree ("order");
  CREATE INDEX "transcripts_rels_parent_idx" ON "transcripts_rels" USING btree ("parent_id");
  CREATE INDEX "transcripts_rels_path_idx" ON "transcripts_rels" USING btree ("path");
  CREATE UNIQUE INDEX "transcripts_rels_meditations_id_idx" ON "transcripts_rels" USING btree ("meditations_id","path");
  CREATE UNIQUE INDEX "transcripts_rels_files_id_idx" ON "transcripts_rels" USING btree ("files_id","path");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transcripts_fk" FOREIGN KEY ("transcripts_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_transcripts_id_idx" ON "payload_locked_documents_rels" USING btree ("transcripts_id");`)
}

/**
 * The reverse, and it recovers every source `up()` moved.
 *
 * A `files`-sourced row has no column in the old shape to go back into, and
 * there can be none: nothing writes one before this migration. So the `UPDATE`
 * below leaves such a row's `meditation_id` null rather than inventing a
 * fallback, and the old `unique` index tolerates any number of nulls.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "transcripts" ADD COLUMN "meditation_id" integer;
  UPDATE "transcripts" SET "meditation_id" = r."meditations_id" FROM "transcripts_rels" r WHERE r."parent_id" = "transcripts"."id" AND r."path" = 'source';
  ALTER TABLE "transcripts" DROP CONSTRAINT "transcripts_job_id_payload_jobs_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_transcripts_fk";

  DROP INDEX "transcripts_job_idx";
  DROP INDEX "transcripts_updated_at_idx";
  DROP INDEX "transcripts_created_at_idx";
  DROP INDEX "payload_locked_documents_rels_transcripts_id_idx";
  ALTER TABLE "transcripts_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "transcripts_rels" CASCADE;
  ALTER TABLE "transcripts" RENAME TO "meditation_transcripts";
  ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "transcripts_id" TO "meditation_transcripts_id";
  ALTER TYPE "public"."enum_transcripts_provider" RENAME TO "enum_meditation_transcripts_provider";
  ALTER TYPE "public"."enum_transcripts_language" RENAME TO "enum_meditation_transcripts_language";
  ALTER TABLE "meditation_transcripts" ADD CONSTRAINT "meditation_transcripts_meditation_id_meditations_id_fk" FOREIGN KEY ("meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "meditation_transcripts" ADD CONSTRAINT "meditation_transcripts_job_id_payload_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "meditation_transcripts_meditation_idx" ON "meditation_transcripts" USING btree ("meditation_id");
  CREATE INDEX "meditation_transcripts_job_idx" ON "meditation_transcripts" USING btree ("job_id");
  CREATE INDEX "meditation_transcripts_updated_at_idx" ON "meditation_transcripts" USING btree ("updated_at");
  CREATE INDEX "meditation_transcripts_created_at_idx" ON "meditation_transcripts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meditation_transcripts_fk" FOREIGN KEY ("meditation_transcripts_id") REFERENCES "public"."meditation_transcripts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_meditation_transcripts_id_idx" ON "payload_locked_documents_rels" USING btree ("meditation_transcripts_id");`)
}
