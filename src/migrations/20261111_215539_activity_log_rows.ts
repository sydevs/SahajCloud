import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Hand-augmented, which the folder guide otherwise forbids: the generated
 * migration drops each jsonb column in the same transaction that creates the
 * tables replacing it, so there is no later window to move the entries in.
 *
 * Losing them is not cosmetic. An event's log is the reminder job's
 * exactly-once marker for the open verification cycle, and a registration's is
 * the session-reminder ledger, so an emptied log re-sends a reminder already
 * sent.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "events_activity_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" varchar,
  	"type" varchar,
  	"key" varchar,
  	"cells" jsonb,
  	"data" jsonb
  );
  
  CREATE TABLE "_events_v_version_activity_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" varchar,
  	"type" varchar,
  	"key" varchar,
  	"cells" jsonb,
  	"data" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "user_submissions_activity_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" varchar,
  	"type" varchar,
  	"key" varchar,
  	"cells" jsonb,
  	"data" jsonb
  );
  
  ALTER TABLE "events_activity_log" ADD CONSTRAINT "events_activity_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_activity_log" ADD CONSTRAINT "_events_v_version_activity_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_submissions_activity_log" ADD CONSTRAINT "user_submissions_activity_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."user_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_activity_log_order_idx" ON "events_activity_log" USING btree ("_order");
  CREATE INDEX "events_activity_log_parent_id_idx" ON "events_activity_log" USING btree ("_parent_id");
  CREATE INDEX "_events_v_version_activity_log_order_idx" ON "_events_v_version_activity_log" USING btree ("_order");
  CREATE INDEX "_events_v_version_activity_log_parent_id_idx" ON "_events_v_version_activity_log" USING btree ("_parent_id");
  CREATE INDEX "user_submissions_activity_log_order_idx" ON "user_submissions_activity_log" USING btree ("_order");
  CREATE INDEX "user_submissions_activity_log_parent_id_idx" ON "user_submissions_activity_log" USING btree ("_parent_id");

  INSERT INTO "events_activity_log" ("_order", "_parent_id", "id", "at", "type", "key", "cells", "data")
  SELECT entry.ordinality, doc.id, gen_random_uuid()::text,
         entry.value->>'at', entry.value->>'type', entry.value->>'key', entry.value->'cells',
         NULLIF(entry.value - 'at' - 'type' - 'key' - 'cells', '{}'::jsonb)
  FROM "events" doc, jsonb_array_elements(doc."activity_log") WITH ORDINALITY AS entry(value, ordinality)
  WHERE jsonb_typeof(doc."activity_log") = 'array' AND jsonb_typeof(entry.value) = 'object';

  INSERT INTO "_events_v_version_activity_log" ("_order", "_parent_id", "_uuid", "at", "type", "key", "cells", "data")
  SELECT entry.ordinality, doc.id, gen_random_uuid()::text,
         entry.value->>'at', entry.value->>'type', entry.value->>'key', entry.value->'cells',
         NULLIF(entry.value - 'at' - 'type' - 'key' - 'cells', '{}'::jsonb)
  FROM "_events_v" doc, jsonb_array_elements(doc."version_activity_log") WITH ORDINALITY AS entry(value, ordinality)
  WHERE jsonb_typeof(doc."version_activity_log") = 'array' AND jsonb_typeof(entry.value) = 'object';

  INSERT INTO "user_submissions_activity_log" ("_order", "_parent_id", "id", "at", "type", "key", "cells", "data")
  SELECT entry.ordinality, doc.id, gen_random_uuid()::text,
         entry.value->>'at', entry.value->>'type', entry.value->>'key', entry.value->'cells',
         NULLIF(entry.value - 'at' - 'type' - 'key' - 'cells', '{}'::jsonb)
  FROM "user_submissions" doc, jsonb_array_elements(doc."activity_log") WITH ORDINALITY AS entry(value, ordinality)
  WHERE jsonb_typeof(doc."activity_log") = 'array' AND jsonb_typeof(entry.value) = 'object';

  ALTER TABLE "events" DROP COLUMN "activity_log";
  ALTER TABLE "_events_v" DROP COLUMN "version_activity_log";
  ALTER TABLE "user_submissions" DROP COLUMN "activity_log";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ADD COLUMN "activity_log" jsonb;
  ALTER TABLE "_events_v" ADD COLUMN "version_activity_log" jsonb;
  ALTER TABLE "user_submissions" ADD COLUMN "activity_log" jsonb;

  UPDATE "events" doc SET "activity_log" = back.log
  FROM (SELECT "_parent_id" AS parent, jsonb_agg(entry ORDER BY ord) AS log FROM (
          SELECT "_parent_id", "_order" AS ord, coalesce("data", '{}'::jsonb) || jsonb_strip_nulls(
            jsonb_build_object('at', "at", 'type', "type", 'key', "key", 'cells', "cells")
          ) AS entry FROM "events_activity_log") entries
        GROUP BY "_parent_id") back
  WHERE doc.id = back.parent;

  UPDATE "_events_v" doc SET "version_activity_log" = back.log
  FROM (SELECT "_parent_id" AS parent, jsonb_agg(entry ORDER BY ord) AS log FROM (
          SELECT "_parent_id", "_order" AS ord, coalesce("data", '{}'::jsonb) || jsonb_strip_nulls(
            jsonb_build_object('at', "at", 'type', "type", 'key', "key", 'cells', "cells")
          ) AS entry FROM "_events_v_version_activity_log") entries
        GROUP BY "_parent_id") back
  WHERE doc.id = back.parent;

  UPDATE "user_submissions" doc SET "activity_log" = back.log
  FROM (SELECT "_parent_id" AS parent, jsonb_agg(entry ORDER BY ord) AS log FROM (
          SELECT "_parent_id", "_order" AS ord, coalesce("data", '{}'::jsonb) || jsonb_strip_nulls(
            jsonb_build_object('at', "at", 'type', "type", 'key', "key", 'cells', "cells")
          ) AS entry FROM "user_submissions_activity_log") entries
        GROUP BY "_parent_id") back
  WHERE doc.id = back.parent;

  DROP TABLE "events_activity_log" CASCADE;
  DROP TABLE "_events_v_version_activity_log" CASCADE;
  DROP TABLE "user_submissions_activity_log" CASCADE;`)
}
