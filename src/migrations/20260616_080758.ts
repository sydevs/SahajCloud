import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_events_language" RENAME TO "enum_events_languages";
  ALTER TYPE "public"."enum__events_v_version_language" RENAME TO "enum__events_v_version_languages";
  CREATE TABLE "events_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_events_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_events_v_version_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__events_v_version_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "events_languages" ADD CONSTRAINT "events_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_languages" ADD CONSTRAINT "_events_v_version_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_languages_order_idx" ON "events_languages" USING btree ("order");
  CREATE INDEX "events_languages_parent_idx" ON "events_languages" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_languages_order_idx" ON "_events_v_version_languages" USING btree ("order");
  CREATE INDEX "_events_v_version_languages_parent_idx" ON "_events_v_version_languages" USING btree ("parent_id");
  ALTER TABLE "events" DROP COLUMN "language";
  ALTER TABLE "_events_v" DROP COLUMN "version_language";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_events_languages" RENAME TO "enum_events_language";
  ALTER TYPE "public"."enum__events_v_version_languages" RENAME TO "enum__events_v_version_language";
  DROP TABLE "events_languages" CASCADE;
  DROP TABLE "_events_v_version_languages" CASCADE;
  ALTER TABLE "events" ADD COLUMN "language" "enum_events_language";
  ALTER TABLE "_events_v" ADD COLUMN "version_language" "enum__events_v_version_language";`)
}
