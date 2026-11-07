import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  -- keyGeneratedAt was never written, and an unset brand colour stores nothing.
  ALTER TABLE "clients" ALTER COLUMN "color1" DROP DEFAULT;
  ALTER TABLE "clients" ALTER COLUMN "color2" DROP DEFAULT;
  ALTER TABLE "clients" ALTER COLUMN "color3" DROP DEFAULT;
  ALTER TABLE "clients" DROP COLUMN "key_generated_at";

  CREATE TYPE "public"."enum_clients_site_track" AS ENUM('custom', 'wp-selfhosted', 'wp-com', 'wix', 'squarespace', 'iframe');
  CREATE TYPE "public"."enum_clients_site_embed_height" AS ENUM('fixed', 'screen', 'window');
  ALTER TABLE "clients" ADD COLUMN "enabled" boolean DEFAULT false;
  ALTER TABLE "clients" ADD COLUMN "canonical_owned" boolean DEFAULT false;
  ALTER TABLE "clients" ADD COLUMN "site_domain" varchar;
  ALTER TABLE "clients" ADD COLUMN "site_page" varchar;
  ALTER TABLE "clients" ADD COLUMN "site_track" "enum_clients_site_track";
  ALTER TABLE "clients" ADD COLUMN "site_embed_height" "enum_clients_site_embed_height";
  CREATE INDEX "clients_enabled_idx" ON "clients" USING btree ("enabled");
  CREATE INDEX "clients_canonical_canonical_owned_idx" ON "clients" USING btree ("canonical_owned");
  -- Backfill, before anything is dropped. A service keeps working on deploy:
  -- its key's switch, its one domain, its primary page and its region claim
  -- all move across.
  UPDATE "clients" SET "name" = 'Service ' || "id" WHERE "name" IS NULL;
  UPDATE "clients" SET "enabled" = ("_status" = 'published');
  -- One domain: the first entry of the old allowlist, split on lines, commas and
  -- whitespace as the old parser split it, with scheme, port, path and a
  -- trailing dot stripped.
  UPDATE "clients" SET "site_domain" = NULLIF(rtrim(lower(regexp_replace(regexp_replace(
    (regexp_split_to_array(btrim(coalesce("allowed_domains", ''), chr(9) || chr(10) || chr(13) || ' ,'),
      '[[:space:],]+'))[1],
    '^[a-z]+://', '', 'i'), '[:/?#].*$', '')), '.'), '');
  -- A designated canonical embed is a page someone chose, so it names both halves.
  UPDATE "clients" SET
    "site_domain" = lower(regexp_replace(regexp_replace("canonical_embed", '^[a-z]+://', '', 'i'), '[:/?#].*$', '')),
    "site_page" = coalesce(nullif(regexp_replace("canonical_embed", '^[a-z]+://[^/?#]+', '', 'i'), ''), '/')
    WHERE coalesce("canonical_embed", '') <> '';
  -- A wildcard keeps its apex and never becomes no domain. No domain is what
  -- the origin gate reads as "an app's key, nothing to enforce", so dropping
  -- "*.sahajayoga.ca" would hand that key every origin on the web. The apex and
  -- its www twin stay enforced; any other subdomain stops loading until the
  -- volunteer installs the address the site is really served at.
  UPDATE "clients" SET "site_domain" = substr("site_domain", 3) WHERE "site_domain" LIKE '*.%';
  -- Still not a bare host (an "n/a"): no domain, rather than a wrong one.
  UPDATE "clients" SET "site_domain" = NULL
    WHERE "site_domain" !~ '^[a-z0-9-]+([.][a-z0-9-]+)+$' AND "site_domain" <> 'localhost';
  -- Ownership carries over only where it was on and the page verified.
  UPDATE "clients" SET "canonical_owned" = true
    WHERE "canonical_enabled" AND "canonical_verification" -> 'verified' IS NOT NULL
      AND jsonb_typeof("canonical_verification" -> 'verified') = 'object';
  -- The widget's self-reported routing, no longer written since #644: dropped
  -- here so the closed verification schema can stop declaring it.
  UPDATE "clients" SET "canonical_verification" = "canonical_verification" #- '{verified,routing}'
    WHERE jsonb_typeof("canonical_verification" -> 'verified') = 'object'
      AND "canonical_verification" -> 'verified' ? 'routing';
  -- #000000 was the old stored default, which the widget already reads as unset.
  UPDATE "clients" SET "color1" = NULL WHERE lower("color1") = '#000000';
  UPDATE "clients" SET "color2" = NULL WHERE lower("color2") = '#000000';
  UPDATE "clients" SET "color3" = NULL WHERE lower("color3") = '#000000';
  -- ⚠ This is reversible in schema, not in data. One site per service keeps one
  -- host, and the down migration rebuilds "allowed_domains" and "website_url" from
  -- "site" — so the allowlist lines after the first, and every website URL, are
  -- gone both ways round. Record them verbatim on the row, where an operator can
  -- read them back, rather than dropping them silently.
  UPDATE "clients" SET "notes" = concat_ws(chr(10) || chr(10),
    nullif(btrim("notes", chr(9) || chr(10) || chr(13) || ' '), ''),
    'One site per service, migrated ' || to_char(now(), 'YYYY-MM-DD') || '. Dropped columns:' ||
    coalesce(chr(10) || 'allowedDomains: ' || nullif(btrim(
      replace("allowed_domains", chr(13), ''), chr(9) || chr(10) || ' '), ''), '') ||
    coalesce(chr(10) || 'websiteUrl: ' || nullif(btrim(
      "website_url", chr(9) || chr(10) || chr(13) || ' '), ''), ''))
    WHERE coalesce(array_length(array_remove(regexp_split_to_array(
      coalesce("allowed_domains", ''), '[[:space:],]+'), ''), 1), 0) > 1
      OR coalesce(btrim("website_url", chr(9) || chr(10) || chr(13) || ' '), '') <> ''
      -- An allowlist that named something yet yields no domain (an "n/a", a
      -- non-ASCII host) leaves a key with no browser origin to enforce, as an
      -- app's key has: recorded, so an admin can set the domain.
      OR ("site_domain" IS NULL AND btrim(coalesce("allowed_domains", ''),
        chr(9) || chr(10) || chr(13) || ' ,') <> '');
  ALTER TABLE "_clients_v_version_roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_clients_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_clients_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "_clients_v_version_roles" CASCADE;
  DROP TABLE "_clients_v" CASCADE;
  DROP TABLE "_clients_v_rels" CASCADE;
  DROP INDEX "clients__status_idx";
  ALTER TABLE "clients" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "clients" DROP COLUMN "allowed_domains";
  ALTER TABLE "clients" DROP COLUMN "website_url";
  ALTER TABLE "clients" DROP COLUMN "canonical_enabled";
  ALTER TABLE "clients" DROP COLUMN "canonical_embed";
  ALTER TABLE "clients" DROP COLUMN "_status";
  DROP TYPE "public"."enum_clients_status";
  DROP TYPE "public"."enum__clients_v_version_roles";
  DROP TYPE "public"."enum__clients_v_version_language";
  DROP TYPE "public"."enum__clients_v_version_status";
  DROP TYPE "public"."enum__clients_v_published_locale";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clients_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__clients_v_version_roles" AS ENUM('wemeditate-web-client', 'wemeditate-app-client', 'sahaj-atlas-client');
  CREATE TYPE "public"."enum__clients_v_version_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum__clients_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__clients_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
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
  	"version_region_id" integer,
  	"version_language" "enum__clients_v_version_language",
  	"version_color1" varchar,
  	"version_color2" varchar,
  	"version_color3" varchar,
  	"version_logo_id" integer,
  	"version_website_url" varchar,
  	"version_support_email" varchar,
  	"version_mailing_list_enabled" boolean DEFAULT false,
  	"version_mailing_list_provider" "enum_clients_mailing_list_provider",
  	"version_mailing_list_list_id" varchar,
  	"version_mailing_list_api_key" varchar,
  	"version_mailing_list_double_opt_in" boolean DEFAULT true,
  	"version_canonical_enabled" boolean DEFAULT false,
  	"version_canonical_embed" varchar,
  	"version_canonical_verification" jsonb,
  	"version_canonical_next_verify_at" timestamp(3) with time zone,
  	"version_embed_metadata" jsonb,
  	"version_usage_daily_requests" numeric DEFAULT 0,
  	"version_usage_peak_daily_requests" numeric DEFAULT 0,
  	"version_usage_last_request_at" timestamp(3) with time zone,
  	"version_usage_total_requests" numeric DEFAULT 0,
  	"version_usage_high_usage_days" numeric DEFAULT 0,
  	"version_usage_last_high_usage_at" timestamp(3) with time zone,
  	"version_usage_first_request_at" timestamp(3) with time zone,
  	"version_client_id" varchar,
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
  
  DROP INDEX "clients_enabled_idx";
  DROP INDEX "clients_canonical_canonical_owned_idx";
  ALTER TABLE "clients" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "clients" ADD COLUMN "allowed_domains" varchar;
  ALTER TABLE "clients" ADD COLUMN "website_url" varchar;
  ALTER TABLE "clients" ADD COLUMN "canonical_enabled" boolean DEFAULT false;
  ALTER TABLE "clients" ADD COLUMN "canonical_embed" varchar;
  ALTER TABLE "clients" ADD COLUMN "_status" "enum_clients_status" DEFAULT 'draft';
  ALTER TABLE "_clients_v_version_roles" ADD CONSTRAINT "_clients_v_version_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_clients_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_parent_id_clients_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_version_primary_contact_id_managers_id_fk" FOREIGN KEY ("version_primary_contact_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_version_region_id_regions_id_fk" FOREIGN KEY ("version_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v" ADD CONSTRAINT "_clients_v_version_logo_id_images_id_fk" FOREIGN KEY ("version_logo_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clients_v_rels" ADD CONSTRAINT "_clients_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_clients_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_clients_v_rels" ADD CONSTRAINT "_clients_v_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_clients_v_version_roles_order_idx" ON "_clients_v_version_roles" USING btree ("order");
  CREATE INDEX "_clients_v_version_roles_parent_idx" ON "_clients_v_version_roles" USING btree ("parent_id");
  CREATE INDEX "_clients_v_parent_idx" ON "_clients_v" USING btree ("parent_id");
  CREATE INDEX "_clients_v_version_version_primary_contact_idx" ON "_clients_v" USING btree ("version_primary_contact_id");
  CREATE INDEX "_clients_v_version_version_region_idx" ON "_clients_v" USING btree ("version_region_id");
  CREATE INDEX "_clients_v_version_version_logo_idx" ON "_clients_v" USING btree ("version_logo_id");
  CREATE INDEX "_clients_v_version_canonical_version_canonical_next_veri_idx" ON "_clients_v" USING btree ("version_canonical_next_verify_at");
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
  UPDATE "clients" SET "_status" = CASE WHEN "enabled" THEN 'published'::"enum_clients_status" ELSE 'draft'::"enum_clients_status" END;
  -- One host, because that is all "site" holds. "website_url" comes back empty
  -- for the same reason. The up migration records both originals in "notes"
  -- rather than pretending this restores them.
  UPDATE "clients" SET "allowed_domains" = "site_domain";
  UPDATE "clients" SET "canonical_enabled" = "canonical_owned";
  UPDATE "clients" SET "canonical_embed" = 'https://' || "site_domain" || "site_page"
    WHERE "site_domain" IS NOT NULL AND "site_page" IS NOT NULL;
  ALTER TABLE "clients" DROP COLUMN "enabled";
  ALTER TABLE "clients" DROP COLUMN "canonical_owned";
  ALTER TABLE "clients" DROP COLUMN "site_domain";
  ALTER TABLE "clients" DROP COLUMN "site_page";
  ALTER TABLE "clients" DROP COLUMN "site_track";
  ALTER TABLE "clients" DROP COLUMN "site_embed_height";
  DROP TYPE "public"."enum_clients_site_track";
  DROP TYPE "public"."enum_clients_site_embed_height";
  ALTER TABLE "clients" ALTER COLUMN "color1" SET DEFAULT '#000000';
  ALTER TABLE "clients" ALTER COLUMN "color2" SET DEFAULT '#000000';
  ALTER TABLE "clients" ALTER COLUMN "color3" SET DEFAULT '#000000';
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color1" SET DEFAULT '#000000';
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color2" SET DEFAULT '#000000';
  ALTER TABLE "_clients_v" ALTER COLUMN "version_color3" SET DEFAULT '#000000';
  ALTER TABLE "clients" ADD COLUMN "key_generated_at" timestamp(3) with time zone;
  ALTER TABLE "_clients_v" ADD COLUMN "version_key_generated_at" timestamp(3) with time zone;`)
}
