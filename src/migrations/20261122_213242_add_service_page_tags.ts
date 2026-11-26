import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_wm_web_config_page_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique', 'subtle-system');
  CREATE TYPE "public"."enum_wm_app_config_page_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique', 'subtle-system');
  ALTER TYPE "public"."enum_pages_tags" ADD VALUE 'subtle-system';
  ALTER TYPE "public"."enum__pages_v_version_tags" ADD VALUE 'subtle-system';
  CREATE TABLE "wm_web_config_page_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_wm_web_config_page_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "wm_app_config_page_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_wm_app_config_page_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "wm_web_config_page_tags" ADD CONSTRAINT "wm_web_config_page_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_web_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_config_page_tags" ADD CONSTRAINT "wm_app_config_page_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_app_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "wm_web_config_page_tags_order_idx" ON "wm_web_config_page_tags" USING btree ("order");
  CREATE INDEX "wm_web_config_page_tags_parent_idx" ON "wm_web_config_page_tags" USING btree ("parent_id");
  CREATE INDEX "wm_app_config_page_tags_order_idx" ON "wm_app_config_page_tags" USING btree ("order");
  CREATE INDEX "wm_app_config_page_tags_parent_idx" ON "wm_app_config_page_tags" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // The rebuild below casts every surviving tag back to the narrower enum, and
  // throws on a page still tagged with the value it removes.
  await db.execute(sql`
   DELETE FROM "pages_tags" WHERE "value" = 'subtle-system';
  DELETE FROM "_pages_v_version_tags" WHERE "value" = 'subtle-system';
  DROP TABLE "wm_web_config_page_tags" CASCADE;
  DROP TABLE "wm_app_config_page_tags" CASCADE;
  ALTER TABLE "pages_tags" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_pages_tags";
  CREATE TYPE "public"."enum_pages_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique');
  ALTER TABLE "pages_tags" ALTER COLUMN "value" SET DATA TYPE "public"."enum_pages_tags" USING "value"::"public"."enum_pages_tags";
  ALTER TABLE "_pages_v_version_tags" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum__pages_v_version_tags";
  CREATE TYPE "public"."enum__pages_v_version_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique');
  ALTER TABLE "_pages_v_version_tags" ALTER COLUMN "value" SET DATA TYPE "public"."enum__pages_v_version_tags" USING "value"::"public"."enum__pages_v_version_tags";
  DROP TYPE "public"."enum_wm_web_config_page_tags";
  DROP TYPE "public"."enum_wm_app_config_page_tags";`)
}
