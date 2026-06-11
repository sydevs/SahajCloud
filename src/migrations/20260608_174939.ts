import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_regions_time_zone" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TYPE "public"."enum_regions_level" AS ENUM('country', 'region', 'area', 'center');
  CREATE TYPE "public"."enum_regions_default_event_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_events_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_events_registration_questions" AS ENUM('questions', 'experience', 'aspirations', 'referral');
  CREATE TYPE "public"."enum_events_event_type" AS ENUM('offline', 'online');
  CREATE TYPE "public"."enum_events_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_events_schedule_firstdate_tz" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TYPE "public"."enum_events_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum_events_schedule_monthly_mode" AS ENUM('date', 'weekday');
  CREATE TYPE "public"."enum_events_schedule_week_number" AS ENUM('1', '2', '3', '4', '-1');
  CREATE TYPE "public"."enum_events_schedule_weekday_of_month" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_events_schedule_ending_type" AS ENUM('count', 'until');
  CREATE TYPE "public"."enum_events_registration_mode" AS ENUM('native', 'external', 'meetup', 'eventbrite', 'facebook');
  CREATE TYPE "public"."enum_events_activity_status" AS ENUM('active', 'expired', 'inactive');
  CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__events_v_version_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum__events_v_version_registration_questions" AS ENUM('questions', 'experience', 'aspirations', 'referral');
  CREATE TYPE "public"."enum__events_v_version_event_type" AS ENUM('offline', 'online');
  CREATE TYPE "public"."enum__events_v_version_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum__events_v_version_schedule_firstdate_tz" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TYPE "public"."enum__events_v_version_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum__events_v_version_schedule_monthly_mode" AS ENUM('date', 'weekday');
  CREATE TYPE "public"."enum__events_v_version_schedule_week_number" AS ENUM('1', '2', '3', '4', '-1');
  CREATE TYPE "public"."enum__events_v_version_schedule_weekday_of_month" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum__events_v_version_schedule_ending_type" AS ENUM('count', 'until');
  CREATE TYPE "public"."enum__events_v_version_registration_mode" AS ENUM('native', 'external', 'meetup', 'eventbrite', 'facebook');
  CREATE TYPE "public"."enum__events_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__events_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_registrations_startingat_tz" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TABLE "regions_time_zone" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_regions_time_zone",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "regions_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_id" integer,
  	"url" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "regions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"level" "enum_regions_level" DEFAULT 'country' NOT NULL,
  	"country_code" varchar,
  	"osm_id" varchar NOT NULL,
  	"default_event_language" "enum_regions_default_event_language",
  	"subtitle" varchar,
  	"latitude" numeric,
  	"longitude" numeric,
  	"radius" numeric,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"parent_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "events_schedule_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_events_schedule_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "events_schedule_exclusions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"reason" varchar
  );
  
  CREATE TABLE "events_registration_questions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_events_registration_questions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_type" "enum_events_event_type" DEFAULT 'offline',
  	"online_url" varchar,
  	"language" "enum_events_language",
  	"description" jsonb,
  	"contact_info_name" varchar,
  	"contact_info_phone" varchar,
  	"schedule_first_date" timestamp(3) with time zone,
  	"schedule_firstdate_tz" "enum_events_schedule_firstdate_tz",
  	"schedule_end_time" varchar,
  	"schedule_recurrence_type" "enum_events_schedule_recurrence_type",
  	"schedule_interval" numeric DEFAULT 1,
  	"schedule_monthly_mode" "enum_events_schedule_monthly_mode" DEFAULT 'date',
  	"schedule_month_day" numeric DEFAULT 1,
  	"schedule_week_number" "enum_events_schedule_week_number" DEFAULT '1',
  	"schedule_weekday_of_month" "enum_events_schedule_weekday_of_month" DEFAULT 'MO',
  	"schedule_ending_type" "enum_events_schedule_ending_type",
  	"schedule_count" numeric DEFAULT 10,
  	"schedule_until_date" timestamp(3) with time zone,
  	"region_id" integer,
  	"room" varchar,
  	"address_street" varchar,
  	"address_city" varchar,
  	"address_post_code" varchar,
  	"address_country_code" varchar,
  	"address_region_code" varchar,
  	"address_latitude" numeric,
  	"address_longitude" numeric,
  	"registration_mode" "enum_events_registration_mode" DEFAULT 'native',
  	"registration_url" varchar,
  	"registration_limit" numeric,
  	"manager_id" integer,
  	"status" "enum_events_activity_status" DEFAULT 'active',
  	"verification_streak" numeric DEFAULT 0,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_events_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "events_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"images_id" integer
  );
  
  CREATE TABLE "_events_v_version_schedule_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__events_v_version_schedule_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_events_v_version_schedule_exclusions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"reason" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_events_v_version_registration_questions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__events_v_version_registration_questions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_events_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_event_type" "enum__events_v_version_event_type" DEFAULT 'offline',
  	"version_online_url" varchar,
  	"version_language" "enum__events_v_version_language",
  	"version_description" jsonb,
  	"version_contact_info_name" varchar,
  	"version_contact_info_phone" varchar,
  	"version_schedule_first_date" timestamp(3) with time zone,
  	"version_schedule_firstdate_tz" "enum__events_v_version_schedule_firstdate_tz",
  	"version_schedule_end_time" varchar,
  	"version_schedule_recurrence_type" "enum__events_v_version_schedule_recurrence_type",
  	"version_schedule_interval" numeric DEFAULT 1,
  	"version_schedule_monthly_mode" "enum__events_v_version_schedule_monthly_mode" DEFAULT 'date',
  	"version_schedule_month_day" numeric DEFAULT 1,
  	"version_schedule_week_number" "enum__events_v_version_schedule_week_number" DEFAULT '1',
  	"version_schedule_weekday_of_month" "enum__events_v_version_schedule_weekday_of_month" DEFAULT 'MO',
  	"version_schedule_ending_type" "enum__events_v_version_schedule_ending_type",
  	"version_schedule_count" numeric DEFAULT 10,
  	"version_schedule_until_date" timestamp(3) with time zone,
  	"version_region_id" integer,
  	"version_room" varchar,
  	"version_address_street" varchar,
  	"version_address_city" varchar,
  	"version_address_post_code" varchar,
  	"version_address_country_code" varchar,
  	"version_address_region_code" varchar,
  	"version_address_latitude" numeric,
  	"version_address_longitude" numeric,
  	"version_registration_mode" "enum__events_v_version_registration_mode" DEFAULT 'native',
  	"version_registration_url" varchar,
  	"version_registration_limit" numeric,
  	"version_manager_id" integer,
  	"version_status" "enum_events_activity_status" DEFAULT 'active',
  	"version_verification_streak" numeric DEFAULT 0,
  	"version_legacy_id" numeric,
  	"version_legacy_data" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__events_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__events_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_events_v_locales" (
  	"version_title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_events_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"images_id" integer
  );
  
  CREATE TABLE "registrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"starting_at" timestamp(3) with time zone,
  	"startingat_tz" "enum_registrations_startingat_tz",
  	"questions" jsonb,
  	"uuid" varchar,
  	"mailing_list_subscribed_at" timestamp(3) with time zone,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "regions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "registrations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "users_id" integer;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event" jsonb;
  ALTER TABLE "regions_time_zone" ADD CONSTRAINT "regions_time_zone_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "regions_breadcrumbs" ADD CONSTRAINT "regions_breadcrumbs_doc_id_regions_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "regions_breadcrumbs" ADD CONSTRAINT "regions_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_regions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events_schedule_weekdays" ADD CONSTRAINT "events_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_schedule_exclusions" ADD CONSTRAINT "events_schedule_exclusions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_registration_questions" ADD CONSTRAINT "events_registration_questions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events_locales" ADD CONSTRAINT "events_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_images_fk" FOREIGN KEY ("images_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_schedule_weekdays" ADD CONSTRAINT "_events_v_version_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_schedule_exclusions" ADD CONSTRAINT "_events_v_version_schedule_exclusions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_registration_questions" ADD CONSTRAINT "_events_v_version_registration_questions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_parent_id_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_region_id_regions_id_fk" FOREIGN KEY ("version_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_manager_id_managers_id_fk" FOREIGN KEY ("version_manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v_locales" ADD CONSTRAINT "_events_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_images_fk" FOREIGN KEY ("images_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "regions_time_zone_order_idx" ON "regions_time_zone" USING btree ("order");
  CREATE INDEX "regions_time_zone_parent_idx" ON "regions_time_zone" USING btree ("parent_id");
  CREATE INDEX "regions_breadcrumbs_order_idx" ON "regions_breadcrumbs" USING btree ("_order");
  CREATE INDEX "regions_breadcrumbs_parent_id_idx" ON "regions_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "regions_breadcrumbs_locale_idx" ON "regions_breadcrumbs" USING btree ("_locale");
  CREATE INDEX "regions_breadcrumbs_doc_idx" ON "regions_breadcrumbs" USING btree ("doc_id");
  CREATE INDEX "regions_legacy_id_idx" ON "regions" USING btree ("legacy_id");
  CREATE INDEX "regions_parent_idx" ON "regions" USING btree ("parent_id");
  CREATE INDEX "regions_updated_at_idx" ON "regions" USING btree ("updated_at");
  CREATE INDEX "regions_created_at_idx" ON "regions" USING btree ("created_at");
  CREATE INDEX "events_schedule_weekdays_order_idx" ON "events_schedule_weekdays" USING btree ("order");
  CREATE INDEX "events_schedule_weekdays_parent_idx" ON "events_schedule_weekdays" USING btree ("parent_id");
  CREATE INDEX "events_schedule_exclusions_order_idx" ON "events_schedule_exclusions" USING btree ("_order");
  CREATE INDEX "events_schedule_exclusions_parent_id_idx" ON "events_schedule_exclusions" USING btree ("_parent_id");
  CREATE INDEX "events_registration_questions_order_idx" ON "events_registration_questions" USING btree ("order");
  CREATE INDEX "events_registration_questions_parent_idx" ON "events_registration_questions" USING btree ("parent_id");
  CREATE INDEX "events_region_idx" ON "events" USING btree ("region_id");
  CREATE INDEX "events_manager_idx" ON "events" USING btree ("manager_id");
  CREATE INDEX "events_legacy_id_idx" ON "events" USING btree ("legacy_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "events__status_idx" ON "events" USING btree ("_status");
  CREATE UNIQUE INDEX "events_locales_locale_parent_id_unique" ON "events_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "events_rels_order_idx" ON "events_rels" USING btree ("order");
  CREATE INDEX "events_rels_parent_idx" ON "events_rels" USING btree ("parent_id");
  CREATE INDEX "events_rels_path_idx" ON "events_rels" USING btree ("path");
  CREATE INDEX "events_rels_images_id_idx" ON "events_rels" USING btree ("images_id");
  CREATE INDEX "_events_v_version_schedule_weekdays_order_idx" ON "_events_v_version_schedule_weekdays" USING btree ("order");
  CREATE INDEX "_events_v_version_schedule_weekdays_parent_idx" ON "_events_v_version_schedule_weekdays" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_schedule_exclusions_order_idx" ON "_events_v_version_schedule_exclusions" USING btree ("_order");
  CREATE INDEX "_events_v_version_schedule_exclusions_parent_id_idx" ON "_events_v_version_schedule_exclusions" USING btree ("_parent_id");
  CREATE INDEX "_events_v_version_registration_questions_order_idx" ON "_events_v_version_registration_questions" USING btree ("order");
  CREATE INDEX "_events_v_version_registration_questions_parent_idx" ON "_events_v_version_registration_questions" USING btree ("parent_id");
  CREATE INDEX "_events_v_parent_idx" ON "_events_v" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_version_region_idx" ON "_events_v" USING btree ("version_region_id");
  CREATE INDEX "_events_v_version_version_manager_idx" ON "_events_v" USING btree ("version_manager_id");
  CREATE INDEX "_events_v_version_version_legacy_id_idx" ON "_events_v" USING btree ("version_legacy_id");
  CREATE INDEX "_events_v_version_version_updated_at_idx" ON "_events_v" USING btree ("version_updated_at");
  CREATE INDEX "_events_v_version_version_created_at_idx" ON "_events_v" USING btree ("version_created_at");
  CREATE INDEX "_events_v_version_version__status_idx" ON "_events_v" USING btree ("version__status");
  CREATE INDEX "_events_v_created_at_idx" ON "_events_v" USING btree ("created_at");
  CREATE INDEX "_events_v_updated_at_idx" ON "_events_v" USING btree ("updated_at");
  CREATE INDEX "_events_v_snapshot_idx" ON "_events_v" USING btree ("snapshot");
  CREATE INDEX "_events_v_published_locale_idx" ON "_events_v" USING btree ("published_locale");
  CREATE INDEX "_events_v_latest_idx" ON "_events_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_events_v_locales_locale_parent_id_unique" ON "_events_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_events_v_rels_order_idx" ON "_events_v_rels" USING btree ("order");
  CREATE INDEX "_events_v_rels_parent_idx" ON "_events_v_rels" USING btree ("parent_id");
  CREATE INDEX "_events_v_rels_path_idx" ON "_events_v_rels" USING btree ("path");
  CREATE INDEX "_events_v_rels_images_id_idx" ON "_events_v_rels" USING btree ("images_id");
  CREATE INDEX "registrations_event_idx" ON "registrations" USING btree ("event_id");
  CREATE INDEX "registrations_user_idx" ON "registrations" USING btree ("user_id");
  CREATE UNIQUE INDEX "registrations_uuid_idx" ON "registrations" USING btree ("uuid");
  CREATE INDEX "registrations_legacy_id_idx" ON "registrations" USING btree ("legacy_id");
  CREATE INDEX "registrations_updated_at_idx" ON "registrations" USING btree ("updated_at");
  CREATE INDEX "registrations_created_at_idx" ON "registrations" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "users_legacy_id_idx" ON "users" USING btree ("legacy_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_regions_fk" FOREIGN KEY ("regions_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_registrations_fk" FOREIGN KEY ("registrations_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_regions_id_idx" ON "payload_locked_documents_rels" USING btree ("regions_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_registrations_id_idx" ON "payload_locked_documents_rels" USING btree ("registrations_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "regions_time_zone" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "regions_breadcrumbs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "regions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_schedule_weekdays" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_schedule_exclusions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_registration_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_version_schedule_weekdays" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_version_schedule_exclusions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_version_registration_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "registrations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "regions_time_zone" CASCADE;
  DROP TABLE "regions_breadcrumbs" CASCADE;
  DROP TABLE "regions" CASCADE;
  DROP TABLE "events_schedule_weekdays" CASCADE;
  DROP TABLE "events_schedule_exclusions" CASCADE;
  DROP TABLE "events_registration_questions" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "events_locales" CASCADE;
  DROP TABLE "events_rels" CASCADE;
  DROP TABLE "_events_v_version_schedule_weekdays" CASCADE;
  DROP TABLE "_events_v_version_schedule_exclusions" CASCADE;
  DROP TABLE "_events_v_version_registration_questions" CASCADE;
  DROP TABLE "_events_v" CASCADE;
  DROP TABLE "_events_v_locales" CASCADE;
  DROP TABLE "_events_v_rels" CASCADE;
  DROP TABLE "registrations" CASCADE;
  DROP TABLE "users" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_regions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_registrations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_users_fk";
  
  DROP INDEX "payload_locked_documents_rels_regions_id_idx";
  DROP INDEX "payload_locked_documents_rels_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_registrations_id_idx";
  DROP INDEX "payload_locked_documents_rels_users_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "regions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "registrations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "users_id";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event";
  DROP TYPE "public"."enum_regions_time_zone";
  DROP TYPE "public"."enum_regions_level";
  DROP TYPE "public"."enum_regions_default_event_language";
  DROP TYPE "public"."enum_events_schedule_weekdays";
  DROP TYPE "public"."enum_events_registration_questions";
  DROP TYPE "public"."enum_events_event_type";
  DROP TYPE "public"."enum_events_language";
  DROP TYPE "public"."enum_events_schedule_firstdate_tz";
  DROP TYPE "public"."enum_events_schedule_recurrence_type";
  DROP TYPE "public"."enum_events_schedule_monthly_mode";
  DROP TYPE "public"."enum_events_schedule_week_number";
  DROP TYPE "public"."enum_events_schedule_weekday_of_month";
  DROP TYPE "public"."enum_events_schedule_ending_type";
  DROP TYPE "public"."enum_events_registration_mode";
  DROP TYPE "public"."enum_events_activity_status";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum__events_v_version_schedule_weekdays";
  DROP TYPE "public"."enum__events_v_version_registration_questions";
  DROP TYPE "public"."enum__events_v_version_event_type";
  DROP TYPE "public"."enum__events_v_version_language";
  DROP TYPE "public"."enum__events_v_version_schedule_firstdate_tz";
  DROP TYPE "public"."enum__events_v_version_schedule_recurrence_type";
  DROP TYPE "public"."enum__events_v_version_schedule_monthly_mode";
  DROP TYPE "public"."enum__events_v_version_schedule_week_number";
  DROP TYPE "public"."enum__events_v_version_schedule_weekday_of_month";
  DROP TYPE "public"."enum__events_v_version_schedule_ending_type";
  DROP TYPE "public"."enum__events_v_version_registration_mode";
  DROP TYPE "public"."enum__events_v_version_status";
  DROP TYPE "public"."enum__events_v_published_locale";
  DROP TYPE "public"."enum_registrations_startingat_tz";`)
}
