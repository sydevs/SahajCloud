import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_regions_event_defaults_time_zone" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TYPE "public"."enum_regions_event_defaults_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TABLE "regions_event_defaults_time_zone" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_regions_event_defaults_time_zone",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "regions_time_zone" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_registration_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_version_registration_questions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "regions_time_zone" CASCADE;
  DROP TABLE "events_registration_questions" CASCADE;
  DROP TABLE "_events_v_version_registration_questions" CASCADE;
  ALTER TABLE "audiences_location_countries" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_audiences_location_countries";
  CREATE TYPE "public"."enum_audiences_location_countries" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CN', 'CX', 'CC', 'CO', 'KM', 'CG', 'CD', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GM', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MK', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'MP', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UM', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  ALTER TABLE "audiences_location_countries" ALTER COLUMN "value" SET DATA TYPE "public"."enum_audiences_location_countries" USING "value"::"public"."enum_audiences_location_countries";
  ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE text;
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::text;
  DROP TYPE "public"."enum_regions_level";
  CREATE TYPE "public"."enum_regions_level" AS ENUM('country', 'region', 'city', 'center');
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::"public"."enum_regions_level";
  ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE "public"."enum_regions_level" USING "level"::"public"."enum_regions_level";
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DATA TYPE text;
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DEFAULT 'sahaj-atlas'::text;
  DROP TYPE "public"."enum_events_registration_mode";
  CREATE TYPE "public"."enum_events_registration_mode" AS ENUM('sahaj-atlas', 'external');
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DEFAULT 'sahaj-atlas'::"public"."enum_events_registration_mode";
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DATA TYPE "public"."enum_events_registration_mode" USING "registration_mode"::"public"."enum_events_registration_mode";
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DATA TYPE text;
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DEFAULT 'sahaj-atlas'::text;
  DROP TYPE "public"."enum__events_v_version_registration_mode";
  CREATE TYPE "public"."enum__events_v_version_registration_mode" AS ENUM('sahaj-atlas', 'external');
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DEFAULT 'sahaj-atlas'::"public"."enum__events_v_version_registration_mode";
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DATA TYPE "public"."enum__events_v_version_registration_mode" USING "version_registration_mode"::"public"."enum__events_v_version_registration_mode";
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DATA TYPE text;
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DEFAULT 'GB'::text;
  DROP TYPE "public"."enum_wm_app_status_baseline_country";
  CREATE TYPE "public"."enum_wm_app_status_baseline_country" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CN', 'CX', 'CC', 'CO', 'KM', 'CG', 'CD', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GM', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MK', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'MP', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UM', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DEFAULT 'GB'::"public"."enum_wm_app_status_baseline_country";
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DATA TYPE "public"."enum_wm_app_status_baseline_country" USING "baseline_country"::"public"."enum_wm_app_status_baseline_country";
  ALTER TABLE "registrations" ALTER COLUMN "uuid" SET NOT NULL;
  ALTER TABLE "regions" ADD COLUMN "mapbox_id" varchar NOT NULL;
  ALTER TABLE "regions" ADD COLUMN "event_defaults_language" "enum_regions_event_defaults_language";
  ALTER TABLE "events" ADD COLUMN "contact_phone" varchar;
  ALTER TABLE "events" ADD COLUMN "contact_name" varchar;
  ALTER TABLE "events" ADD COLUMN "address_mapbox_id" varchar;
  ALTER TABLE "events" ADD COLUMN "address_room" varchar;
  ALTER TABLE "events" ADD COLUMN "address_country" varchar;
  ALTER TABLE "events" ADD COLUMN "address_region" varchar;
  ALTER TABLE "events" ADD COLUMN "external_registration_url" varchar;
  ALTER TABLE "events" ADD COLUMN "registration_questions_prior_experience" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_referral_source" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_health_info" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_accessibility" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_guests" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_contact_phone" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_contact_name" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_address_mapbox_id" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_address_room" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_address_country" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_address_region" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_external_registration_url" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_prior_experience" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_referral_source" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_health_info" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_accessibility" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_guests" boolean;
  ALTER TABLE "regions_event_defaults_time_zone" ADD CONSTRAINT "regions_event_defaults_time_zone_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "regions_event_defaults_time_zone_order_idx" ON "regions_event_defaults_time_zone" USING btree ("order");
  CREATE INDEX "regions_event_defaults_time_zone_parent_idx" ON "regions_event_defaults_time_zone" USING btree ("parent_id");
  ALTER TABLE "regions" DROP COLUMN "country_code";
  ALTER TABLE "regions" DROP COLUMN "osm_id";
  ALTER TABLE "regions" DROP COLUMN "default_event_language";
  ALTER TABLE "events" DROP COLUMN "contact_info_name";
  ALTER TABLE "events" DROP COLUMN "contact_info_phone";
  ALTER TABLE "events" DROP COLUMN "room";
  ALTER TABLE "events" DROP COLUMN "address_country_code";
  ALTER TABLE "events" DROP COLUMN "address_region_code";
  ALTER TABLE "events" DROP COLUMN "registration_url";
  ALTER TABLE "_events_v" DROP COLUMN "version_contact_info_name";
  ALTER TABLE "_events_v" DROP COLUMN "version_contact_info_phone";
  ALTER TABLE "_events_v" DROP COLUMN "version_room";
  ALTER TABLE "_events_v" DROP COLUMN "version_address_country_code";
  ALTER TABLE "_events_v" DROP COLUMN "version_address_region_code";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_url";
  DROP TYPE "public"."enum_regions_time_zone";
  DROP TYPE "public"."enum_regions_default_event_language";
  DROP TYPE "public"."enum_events_registration_questions";
  DROP TYPE "public"."enum__events_v_version_registration_questions";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_regions_time_zone" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TYPE "public"."enum_regions_default_event_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_events_registration_questions" AS ENUM('questions', 'experience', 'aspirations', 'referral');
  CREATE TYPE "public"."enum__events_v_version_registration_questions" AS ENUM('questions', 'experience', 'aspirations', 'referral');
  CREATE TABLE "regions_time_zone" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_regions_time_zone",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "events_registration_questions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_events_registration_questions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_events_v_version_registration_questions" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__events_v_version_registration_questions",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "regions_event_defaults_time_zone" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "regions_event_defaults_time_zone" CASCADE;
  ALTER TABLE "audiences_location_countries" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_audiences_location_countries";
  CREATE TYPE "public"."enum_audiences_location_countries" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CX', 'CC', 'CO', 'KM', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'CD', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IQ', 'IE', 'IR', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'KP', 'MP', 'NO', 'OM', 'PK', 'PW', 'PA', 'PG', 'PY', 'CN', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'CG', 'GM', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'KR', 'SS', 'ES', 'LK', 'PS', 'SD', 'SR', 'SJ', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TH', 'MK', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'TZ', 'UM', 'US', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  ALTER TABLE "audiences_location_countries" ALTER COLUMN "value" SET DATA TYPE "public"."enum_audiences_location_countries" USING "value"::"public"."enum_audiences_location_countries";
  ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE text;
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::text;
  DROP TYPE "public"."enum_regions_level";
  CREATE TYPE "public"."enum_regions_level" AS ENUM('country', 'region', 'area', 'center');
  ALTER TABLE "regions" ALTER COLUMN "level" SET DEFAULT 'country'::"public"."enum_regions_level";
  ALTER TABLE "regions" ALTER COLUMN "level" SET DATA TYPE "public"."enum_regions_level" USING "level"::"public"."enum_regions_level";
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DATA TYPE text;
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DEFAULT 'native'::text;
  DROP TYPE "public"."enum_events_registration_mode";
  CREATE TYPE "public"."enum_events_registration_mode" AS ENUM('native', 'external', 'meetup', 'eventbrite', 'facebook');
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DEFAULT 'native'::"public"."enum_events_registration_mode";
  ALTER TABLE "events" ALTER COLUMN "registration_mode" SET DATA TYPE "public"."enum_events_registration_mode" USING "registration_mode"::"public"."enum_events_registration_mode";
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DATA TYPE text;
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DEFAULT 'native'::text;
  DROP TYPE "public"."enum__events_v_version_registration_mode";
  CREATE TYPE "public"."enum__events_v_version_registration_mode" AS ENUM('native', 'external', 'meetup', 'eventbrite', 'facebook');
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DEFAULT 'native'::"public"."enum__events_v_version_registration_mode";
  ALTER TABLE "_events_v" ALTER COLUMN "version_registration_mode" SET DATA TYPE "public"."enum__events_v_version_registration_mode" USING "version_registration_mode"::"public"."enum__events_v_version_registration_mode";
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DATA TYPE text;
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DEFAULT 'GB'::text;
  DROP TYPE "public"."enum_wm_app_status_baseline_country";
  CREATE TYPE "public"."enum_wm_app_status_baseline_country" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CX', 'CC', 'CO', 'KM', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'CD', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IQ', 'IE', 'IR', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'KP', 'MP', 'NO', 'OM', 'PK', 'PW', 'PA', 'PG', 'PY', 'CN', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'CG', 'GM', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'KR', 'SS', 'ES', 'LK', 'PS', 'SD', 'SR', 'SJ', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TH', 'MK', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'TZ', 'UM', 'US', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DEFAULT 'GB'::"public"."enum_wm_app_status_baseline_country";
  ALTER TABLE "wm_app_status_locales" ALTER COLUMN "baseline_country" SET DATA TYPE "public"."enum_wm_app_status_baseline_country" USING "baseline_country"::"public"."enum_wm_app_status_baseline_country";
  ALTER TABLE "registrations" ALTER COLUMN "uuid" DROP NOT NULL;
  ALTER TABLE "regions" ADD COLUMN "country_code" varchar;
  ALTER TABLE "regions" ADD COLUMN "osm_id" varchar NOT NULL;
  ALTER TABLE "regions" ADD COLUMN "default_event_language" "enum_regions_default_event_language";
  ALTER TABLE "events" ADD COLUMN "contact_info_name" varchar;
  ALTER TABLE "events" ADD COLUMN "contact_info_phone" varchar;
  ALTER TABLE "events" ADD COLUMN "room" varchar;
  ALTER TABLE "events" ADD COLUMN "address_country_code" varchar;
  ALTER TABLE "events" ADD COLUMN "address_region_code" varchar;
  ALTER TABLE "events" ADD COLUMN "registration_url" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_contact_info_name" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_contact_info_phone" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_room" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_address_country_code" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_address_region_code" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_url" varchar;
  ALTER TABLE "regions_time_zone" ADD CONSTRAINT "regions_time_zone_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_registration_questions" ADD CONSTRAINT "events_registration_questions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_registration_questions" ADD CONSTRAINT "_events_v_version_registration_questions_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "regions_time_zone_order_idx" ON "regions_time_zone" USING btree ("order");
  CREATE INDEX "regions_time_zone_parent_idx" ON "regions_time_zone" USING btree ("parent_id");
  CREATE INDEX "events_registration_questions_order_idx" ON "events_registration_questions" USING btree ("order");
  CREATE INDEX "events_registration_questions_parent_idx" ON "events_registration_questions" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_registration_questions_order_idx" ON "_events_v_version_registration_questions" USING btree ("order");
  CREATE INDEX "_events_v_version_registration_questions_parent_idx" ON "_events_v_version_registration_questions" USING btree ("parent_id");
  ALTER TABLE "regions" DROP COLUMN "mapbox_id";
  ALTER TABLE "regions" DROP COLUMN "event_defaults_language";
  ALTER TABLE "events" DROP COLUMN "contact_phone";
  ALTER TABLE "events" DROP COLUMN "contact_name";
  ALTER TABLE "events" DROP COLUMN "address_mapbox_id";
  ALTER TABLE "events" DROP COLUMN "address_room";
  ALTER TABLE "events" DROP COLUMN "address_country";
  ALTER TABLE "events" DROP COLUMN "address_region";
  ALTER TABLE "events" DROP COLUMN "external_registration_url";
  ALTER TABLE "events" DROP COLUMN "registration_questions_prior_experience";
  ALTER TABLE "events" DROP COLUMN "registration_questions_referral_source";
  ALTER TABLE "events" DROP COLUMN "registration_questions_health_info";
  ALTER TABLE "events" DROP COLUMN "registration_questions_accessibility";
  ALTER TABLE "events" DROP COLUMN "registration_questions_guests";
  ALTER TABLE "_events_v" DROP COLUMN "version_contact_phone";
  ALTER TABLE "_events_v" DROP COLUMN "version_contact_name";
  ALTER TABLE "_events_v" DROP COLUMN "version_address_mapbox_id";
  ALTER TABLE "_events_v" DROP COLUMN "version_address_room";
  ALTER TABLE "_events_v" DROP COLUMN "version_address_country";
  ALTER TABLE "_events_v" DROP COLUMN "version_address_region";
  ALTER TABLE "_events_v" DROP COLUMN "version_external_registration_url";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_prior_experience";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_referral_source";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_health_info";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_accessibility";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_guests";
  DROP TYPE "public"."enum_regions_event_defaults_time_zone";
  DROP TYPE "public"."enum_regions_event_defaults_language";`)
}
