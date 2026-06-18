import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clients_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__clients_v_version_roles" AS ENUM('wemeditate-web-client', 'wemeditate-app-client', 'sahaj-atlas-client');
  CREATE TYPE "public"."enum__clients_v_version_locale" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum__clients_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__clients_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TABLE "_clients_v_version_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__clients_v_version_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_clients_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_notes" varchar,
  	"version_primary_contact_id" integer,
  	"version_allowed_domains" varchar,
  	"version_color1" varchar DEFAULT '#000000',
  	"version_color2" varchar DEFAULT '#000000',
  	"version_color3" varchar DEFAULT '#000000',
  	"version_locale" "enum__clients_v_version_locale",
  	"version_region_id" integer,
  	"version_legacy_config" jsonb,
  	"version_client_id" varchar,
  	"version_key_generated_at" timestamp(3) with time zone,
  	"version_usage_daily_requests" numeric DEFAULT 0,
  	"version_usage_peak_daily_requests" numeric DEFAULT 0,
  	"version_usage_last_request_at" timestamp(3) with time zone,
  	"version_usage_total_requests" numeric DEFAULT 0,
  	"version_usage_high_usage_days" numeric DEFAULT 0,
  	"version_usage_last_high_usage_at" timestamp(3) with time zone,
  	"version_usage_first_request_at" timestamp(3) with time zone,
  	"version_legacy_id" numeric,
  	"version_legacy_data" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__clients_v_version_status" DEFAULT 'draft',
  	"version_enable_a_p_i_key" boolean,
  	"version_api_key" varchar,
  	"version_api_key_index" varchar,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__clients_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_clients_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
  );
  
  ALTER TABLE "clients" RENAME COLUMN "domains" TO "allowed_domains";
  DROP INDEX "active_idx";
  ALTER TABLE "clients" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "clients" ALTER COLUMN "primary_contact_id" DROP NOT NULL;
  ALTER TABLE "clients" ADD COLUMN "_status" "enum_clients_status" DEFAULT 'draft';
  -- Backfill before dropping "active": preserve disabled clients as drafts
  -- (active=false -> draft, can't authenticate); active -> published.
  UPDATE "clients" SET "_status" = CASE WHEN "active" THEN 'published' ELSE 'draft' END;
  -- Backfill a UUID clientId for any client created before auto-generation.
  UPDATE "clients" SET "client_id" = gen_random_uuid()::text WHERE "client_id" IS NULL;

  ALTER TABLE "_clients_v_version_roles" ADD CONSTRAINT "_clients_v_version_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_clients_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_parent_id_clients_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_version_primary_contact_id_managers_id_fk" FOREIGN KEY ("version_primary_contact_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_version_region_id_regions_id_fk" FOREIGN KEY ("version_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v_rels" ADD CONSTRAINT "_clients_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_clients_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_clients_v_rels" ADD CONSTRAINT "_clients_v_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_clients_v_version_roles_order_idx" ON "_clients_v_version_roles" USING btree ("order");
  CREATE INDEX "_clients_v_version_roles_parent_idx" ON "_clients_v_version_roles" USING btree ("parent_id");
  CREATE INDEX "_clients_v_parent_idx" ON "_clients_v" USING btree ("parent_id");
  CREATE INDEX "_clients_v_version_version_primary_contact_idx" ON "_clients_v" USING btree ("version_primary_contact_id");
  CREATE INDEX "_clients_v_version_version_region_idx" ON "_clients_v" USING btree ("version_region_id");
  CREATE INDEX "_clients_v_version_version_legacy_id_idx" ON "_clients_v" USING btree ("version_legacy_id");
  CREATE INDEX "_clients_v_version_version_updated_at_idx" ON "_clients_v" USING btree ("version_updated_at");
  CREATE INDEX "_clients_v_version_version_created_at_idx" ON "_clients_v" USING btree ("version_created_at");
  CREATE INDEX "_clients_v_version_version__status_idx" ON "_clients_v" USING btree ("version__status");
  CREATE INDEX "_clients_v_created_at_idx" ON "_clients_v" USING btree ("created_at");
  CREATE INDEX "_clients_v_updated_at_idx" ON "_clients_v" USING btree ("updated_at");
  CREATE INDEX "_clients_v_snapshot_idx" ON "_clients_v" USING btree ("snapshot");
  CREATE INDEX "_clients_v_published_locale_idx" ON "_clients_v" USING btree ("published_locale");
  CREATE INDEX "_clients_v_latest_idx" ON "_clients_v" USING btree ("latest");
  CREATE INDEX "_clients_v_rels_order_idx" ON "_clients_v_rels" USING btree ("order");
  CREATE INDEX "_clients_v_rels_parent_idx" ON "_clients_v_rels" USING btree ("parent_id");
  CREATE INDEX "_clients_v_rels_path_idx" ON "_clients_v_rels" USING btree ("path");
  CREATE INDEX "_clients_v_rels_managers_id_idx" ON "_clients_v_rels" USING btree ("managers_id");
  CREATE INDEX "clients__status_idx" ON "clients" USING btree ("_status");
  ALTER TABLE "clients" DROP COLUMN "active";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_clients_v_version_roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_clients_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_clients_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "_clients_v_version_roles" CASCADE;
  DROP TABLE "_clients_v" CASCADE;
  DROP TABLE "_clients_v_rels" CASCADE;
  ALTER TABLE "clients" RENAME COLUMN "allowed_domains" TO "domains";
  DROP INDEX "clients__status_idx";
  ALTER TABLE "clients" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "clients" ALTER COLUMN "primary_contact_id" SET NOT NULL;
  ALTER TABLE "clients" ADD COLUMN "active" boolean DEFAULT true;
  -- Restore "active" from publish status before dropping "_status" (lossless round-trip).
  UPDATE "clients" SET "active" = ("_status" = 'published');

  CREATE INDEX "active_idx" ON "clients" USING btree ("active");
  ALTER TABLE "clients" DROP COLUMN "_status";
  DROP TYPE "public"."enum_clients_status";
  DROP TYPE "public"."enum__clients_v_version_roles";
  DROP TYPE "public"."enum__clients_v_version_locale";
  DROP TYPE "public"."enum__clients_v_version_status";
  DROP TYPE "public"."enum__clients_v_published_locale";`)
}
