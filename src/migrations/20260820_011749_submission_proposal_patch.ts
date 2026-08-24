import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "event_submissions_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions_schedule_weekdays" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "event_submissions_languages" CASCADE;
  DROP TABLE "event_submissions_schedule_weekdays" CASCADE;
  ALTER TABLE "event_submissions" DROP CONSTRAINT "event_submissions_country_id_regions_id_fk";
  
  ALTER TABLE "event_submissions" DROP CONSTRAINT "event_submissions_state_id_regions_id_fk";
  
  ALTER TABLE "event_submissions" DROP CONSTRAINT "event_submissions_anchor_region_id_regions_id_fk";
  
  DROP INDEX "event_submissions_country_idx";
  DROP INDEX "event_submissions_state_idx";
  DROP INDEX "event_submissions_anchor_region_idx";
  ALTER TABLE "event_submissions" ADD COLUMN "submitter_info" jsonb;
  ALTER TABLE "event_submissions" ADD COLUMN "proposed" jsonb;
  ALTER TABLE "event_submissions" ADD COLUMN "region_hint" jsonb;
  ALTER TABLE "event_submissions" DROP COLUMN "submitter_name";
  ALTER TABLE "event_submissions" DROP COLUMN "submitter_email";
  ALTER TABLE "event_submissions" DROP COLUMN "submitter_note";
  ALTER TABLE "event_submissions" DROP COLUMN "event_type";
  ALTER TABLE "event_submissions" DROP COLUMN "online_url";
  ALTER TABLE "event_submissions" DROP COLUMN "address_mapbox_id";
  ALTER TABLE "event_submissions" DROP COLUMN "address_venue_name";
  ALTER TABLE "event_submissions" DROP COLUMN "address_street";
  ALTER TABLE "event_submissions" DROP COLUMN "address_room";
  ALTER TABLE "event_submissions" DROP COLUMN "address_post_code";
  ALTER TABLE "event_submissions" DROP COLUMN "address_country";
  ALTER TABLE "event_submissions" DROP COLUMN "address_region";
  ALTER TABLE "event_submissions" DROP COLUMN "address_city";
  ALTER TABLE "event_submissions" DROP COLUMN "address_latitude";
  ALTER TABLE "event_submissions" DROP COLUMN "address_longitude";
  ALTER TABLE "event_submissions" DROP COLUMN "contact_name";
  ALTER TABLE "event_submissions" DROP COLUMN "contact_email";
  ALTER TABLE "event_submissions" DROP COLUMN "contact_phone";
  ALTER TABLE "event_submissions" DROP COLUMN "description";
  ALTER TABLE "event_submissions" DROP COLUMN "schedule_schedule_type";
  ALTER TABLE "event_submissions" DROP COLUMN "schedule_start_date";
  ALTER TABLE "event_submissions" DROP COLUMN "schedule_end_date";
  ALTER TABLE "event_submissions" DROP COLUMN "schedule_start_time";
  ALTER TABLE "event_submissions" DROP COLUMN "schedule_end_time";
  ALTER TABLE "event_submissions" DROP COLUMN "schedule_timezone";
  ALTER TABLE "event_submissions" DROP COLUMN "country_id";
  ALTER TABLE "event_submissions" DROP COLUMN "state_id";
  ALTER TABLE "event_submissions" DROP COLUMN "anchor_region_id";
  DROP TYPE "public"."enum_event_submissions_languages";
  DROP TYPE "public"."enum_event_submissions_schedule_weekdays";
  DROP TYPE "public"."enum_event_submissions_event_type";
  DROP TYPE "public"."enum_event_submissions_schedule_type";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_event_submissions_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_event_submissions_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_event_submissions_event_type" AS ENUM('offline', 'online');
  CREATE TYPE "public"."enum_event_submissions_schedule_type" AS ENUM('one-off', 'weekly');
  CREATE TABLE "event_submissions_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_event_submissions_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "event_submissions_schedule_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_event_submissions_schedule_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "event_submissions" ADD COLUMN "submitter_name" varchar NOT NULL;
  ALTER TABLE "event_submissions" ADD COLUMN "submitter_email" varchar NOT NULL;
  ALTER TABLE "event_submissions" ADD COLUMN "submitter_note" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "event_type" "enum_event_submissions_event_type";
  ALTER TABLE "event_submissions" ADD COLUMN "online_url" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_mapbox_id" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_venue_name" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_street" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_room" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_post_code" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_country" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_region" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_city" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "address_latitude" numeric;
  ALTER TABLE "event_submissions" ADD COLUMN "address_longitude" numeric;
  ALTER TABLE "event_submissions" ADD COLUMN "contact_name" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "contact_email" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "contact_phone" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "description" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "schedule_schedule_type" "enum_event_submissions_schedule_type";
  ALTER TABLE "event_submissions" ADD COLUMN "schedule_start_date" timestamp(3) with time zone;
  ALTER TABLE "event_submissions" ADD COLUMN "schedule_end_date" timestamp(3) with time zone;
  ALTER TABLE "event_submissions" ADD COLUMN "schedule_start_time" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "schedule_end_time" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "schedule_timezone" varchar;
  ALTER TABLE "event_submissions" ADD COLUMN "country_id" integer;
  ALTER TABLE "event_submissions" ADD COLUMN "state_id" integer;
  ALTER TABLE "event_submissions" ADD COLUMN "anchor_region_id" integer;
  ALTER TABLE "event_submissions_languages" ADD CONSTRAINT "event_submissions_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions_schedule_weekdays" ADD CONSTRAINT "event_submissions_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "event_submissions_languages_order_idx" ON "event_submissions_languages" USING btree ("order");
  CREATE INDEX "event_submissions_languages_parent_idx" ON "event_submissions_languages" USING btree ("parent_id");
  CREATE INDEX "event_submissions_schedule_weekdays_order_idx" ON "event_submissions_schedule_weekdays" USING btree ("order");
  CREATE INDEX "event_submissions_schedule_weekdays_parent_idx" ON "event_submissions_schedule_weekdays" USING btree ("parent_id");
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_country_id_regions_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_state_id_regions_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_anchor_region_id_regions_id_fk" FOREIGN KEY ("anchor_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "event_submissions_country_idx" ON "event_submissions" USING btree ("country_id");
  CREATE INDEX "event_submissions_state_idx" ON "event_submissions" USING btree ("state_id");
  CREATE INDEX "event_submissions_anchor_region_idx" ON "event_submissions" USING btree ("anchor_region_id");
  ALTER TABLE "event_submissions" DROP COLUMN "submitter_info";
  ALTER TABLE "event_submissions" DROP COLUMN "proposed";
  ALTER TABLE "event_submissions" DROP COLUMN "region_hint";`)
}
