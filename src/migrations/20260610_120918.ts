import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_managers_contact_details_platform" AS ENUM('whatsapp', 'telegram', 'wechat');
  CREATE TYPE "public"."enum_managers_language_code" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_clients_locale" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TABLE "managers_contact_details" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_managers_contact_details_platform" NOT NULL,
  	"identifier" varchar NOT NULL,
  	"verified" boolean
  );
  
  CREATE TABLE "regions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
  );
  
  ALTER TABLE "managers" ADD COLUMN "language_code" "enum_managers_language_code";
  ALTER TABLE "managers" ADD COLUMN "notification_preferences" jsonb DEFAULT '{"new_responsibility":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Immediate","method":"email"},"regional_summary":{"frequency":"Monthly","method":"email"}}'::jsonb;
  ALTER TABLE "managers" ADD COLUMN "legacy_id" numeric;
  ALTER TABLE "managers" ADD COLUMN "legacy_data" jsonb;
  ALTER TABLE "clients" ADD COLUMN "client_id" varchar;
  ALTER TABLE "clients" ADD COLUMN "color1" varchar DEFAULT '#000000';
  ALTER TABLE "clients" ADD COLUMN "color2" varchar DEFAULT '#000000';
  ALTER TABLE "clients" ADD COLUMN "color3" varchar DEFAULT '#000000';
  ALTER TABLE "clients" ADD COLUMN "locale" "enum_clients_locale";
  ALTER TABLE "clients" ADD COLUMN "region_id" integer;
  ALTER TABLE "clients" ADD COLUMN "legacy_config" jsonb;
  ALTER TABLE "clients" ADD COLUMN "legacy_id" numeric;
  ALTER TABLE "clients" ADD COLUMN "legacy_data" jsonb;
  ALTER TABLE "managers_contact_details" ADD CONSTRAINT "managers_contact_details_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "regions_rels" ADD CONSTRAINT "regions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "regions_rels" ADD CONSTRAINT "regions_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "managers_contact_details_order_idx" ON "managers_contact_details" USING btree ("_order");
  CREATE INDEX "managers_contact_details_parent_id_idx" ON "managers_contact_details" USING btree ("_parent_id");
  CREATE INDEX "regions_rels_order_idx" ON "regions_rels" USING btree ("order");
  CREATE INDEX "regions_rels_parent_idx" ON "regions_rels" USING btree ("parent_id");
  CREATE INDEX "regions_rels_path_idx" ON "regions_rels" USING btree ("path");
  CREATE INDEX "regions_rels_managers_id_idx" ON "regions_rels" USING btree ("managers_id");
  ALTER TABLE "clients" ADD CONSTRAINT "clients_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "managers_legacy_id_idx" ON "managers" USING btree ("legacy_id");
  CREATE INDEX "clients_region_idx" ON "clients" USING btree ("region_id");
  CREATE INDEX "clients_legacy_id_idx" ON "clients" USING btree ("legacy_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "managers_contact_details" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "regions_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "managers_contact_details" CASCADE;
  DROP TABLE "regions_rels" CASCADE;
  ALTER TABLE "clients" DROP CONSTRAINT "clients_region_id_regions_id_fk";
  
  DROP INDEX "managers_legacy_id_idx";
  DROP INDEX "clients_region_idx";
  DROP INDEX "clients_legacy_id_idx";
  ALTER TABLE "managers" DROP COLUMN "language_code";
  ALTER TABLE "managers" DROP COLUMN "notification_preferences";
  ALTER TABLE "managers" DROP COLUMN "legacy_id";
  ALTER TABLE "managers" DROP COLUMN "legacy_data";
  ALTER TABLE "clients" DROP COLUMN "client_id";
  ALTER TABLE "clients" DROP COLUMN "color1";
  ALTER TABLE "clients" DROP COLUMN "color2";
  ALTER TABLE "clients" DROP COLUMN "color3";
  ALTER TABLE "clients" DROP COLUMN "locale";
  ALTER TABLE "clients" DROP COLUMN "region_id";
  ALTER TABLE "clients" DROP COLUMN "legacy_config";
  ALTER TABLE "clients" DROP COLUMN "legacy_id";
  ALTER TABLE "clients" DROP COLUMN "legacy_data";
  DROP TYPE "public"."enum_managers_contact_details_platform";
  DROP TYPE "public"."enum_managers_language_code";
  DROP TYPE "public"."enum_clients_locale";`)
}
