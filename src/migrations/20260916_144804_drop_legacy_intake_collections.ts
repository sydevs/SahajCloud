import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Hand-added, and the migration fails without it. Postgres cannot drop an
  // enum value, so drizzle recreates `enum_payload_jobs*_task_slug` below and
  // casts the column back — and that cast fails on any row still holding one of
  // the three slugs whose jobs are deleted here. Queued or logged work for a
  // job that no longer exists has nothing to run it, so the rows go.
  await db.execute(sql`
   DELETE FROM "payload_jobs_log" WHERE "task_slug" IN ('screenUserMessage', 'screenEventSubmission', 'purgeUserMessages');
  DELETE FROM "payload_jobs" WHERE "task_slug" IN ('screenUserMessage', 'screenEventSubmission', 'purgeUserMessages');`)

  // CASCADE takes the three payload_locked_documents_rels foreign keys with the
  // tables, so the generated DROP CONSTRAINT for each is removed — it errors as
  // missing. CASCADE leaves their columns, which the DROP COLUMNs below take.
  await db.execute(sql`
   ALTER TABLE "event_submissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "registrations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "user_messages" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "event_submissions" CASCADE;
  DROP TABLE "registrations" CASCADE;
  DROP TABLE "user_messages" CASCADE;
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'purgeSubmissions', 'screenSubmission', 'sendPostEventFollowUps', 'sendRegistrationDigests', 'sendSessionReminders', 'syncLectureMetadata', 'verifyEmbeds', 'resetUsage', 'schedulePublish');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_locked_documents_rels_event_submissions_id_idx";
  DROP INDEX "payload_locked_documents_rels_registrations_id_idx";
  DROP INDEX "payload_locked_documents_rels_user_messages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_submissions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "registrations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "user_messages_id";
  DROP TYPE "public"."enum_event_submissions_status";
  DROP TYPE "public"."enum_registrations_startingat_tz";
  DROP TYPE "public"."enum_registrations_locale";
  DROP TYPE "public"."enum_registrations_event_feedback";
  DROP TYPE "public"."enum_user_messages_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_event_submissions_status" AS ENUM('screening', 'pending', 'spam', 'created', 'updated', 'rejected');
  CREATE TYPE "public"."enum_registrations_startingat_tz" AS ENUM('UTC', 'Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Pago_Pago', 'US/Samoa', 'Pacific/Samoa', 'America/Adak', 'US/Aleutian', 'America/Atka', 'US/Hawaii', 'Pacific/Johnston', 'HST', 'Pacific/Tahiti', 'Pacific/Marquesas', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska', 'US/Pacific', 'PST8PDT', 'Mexico/BajaNorte', 'America/Ensenada', 'America/Santa_Isabel', 'America/Vancouver', 'Canada/Pacific', 'Pacific/Pitcairn', 'America/Ciudad_Juarez', 'America/Boise', 'MST7MDT', 'Navajo', 'US/Mountain', 'America/Shiprock', 'America/Edmonton', 'America/Cambridge_Bay', 'America/Inuvik', 'Canada/Mountain', 'America/Yellowknife', 'America/Hermosillo', 'America/Mazatlan', 'Mexico/BajaSur', 'MST', 'US/Arizona', 'America/Creston', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'Canada/Yukon', 'America/Belize', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'CST6CDT', 'US/Central', 'US/Indiana-Starke', 'America/Knox_IN', 'America/Costa_Rica', 'America/El_Salvador', 'America/Managua', 'America/Matamoros', 'America/Ojinaga', 'America/Mexico_City', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Merida', 'America/Monterrey', 'Mexico/General', 'America/Regina', 'America/Swift_Current', 'Canada/Saskatchewan', 'America/Tegucigalpa', 'America/Winnipeg', 'America/Rankin_Inlet', 'America/Resolute', 'Canada/Central', 'America/Rainy_River', 'Pacific/Easter', 'Chile/EasterIsland', 'Pacific/Galapagos', 'America/Atikokan', 'America/Cancun', 'America/Cayman', 'America/Grand_Turk', 'America/Guayaquil', 'America/Havana', 'Cuba', 'America/Jamaica', 'Jamaica', 'America/Lima', 'America/Nassau', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'US/Michigan', 'US/East-Indiana', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville', 'EST5EDT', 'US/Eastern', 'America/Panama', 'EST', 'America/Coral_Harbour', 'America/Port-au-Prince', 'America/Rio_Branco', 'America/Eirunepe', 'Brazil/Acre', 'America/Porto_Acre', 'America/Toronto', 'America/Iqaluit', 'America/Pangnirtung', 'Canada/Eastern', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Anguilla', 'America/Antigua', 'America/Aruba', 'America/Barbados', 'America/Blanc-Sablon', 'America/Curacao', 'America/Dominica', 'America/Grenada', 'America/Guadeloupe', 'America/Guyana', 'America/Halifax', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Moncton', 'Canada/Atlantic', 'America/Kralendijk', 'America/La_Paz', 'America/Lower_Princes', 'America/Manaus', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Porto_Velho', 'Brazil/West', 'America/Marigot', 'America/Martinique', 'America/Montserrat', 'America/Port_of_Spain', 'America/Puerto_Rico', 'America/Virgin', 'America/St_Barthelemy', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas', 'America/St_Vincent', 'America/Tortola', 'Chile/Continental', 'America/Santo_Domingo', 'America/Thule', 'Atlantic/Bermuda', 'America/St_Johns', 'Canada/Newfoundland', 'America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Catamarca', 'America/Argentina/ComodRivadavia', 'America/Cordoba', 'America/Rosario', 'America/Jujuy', 'America/Mendoza', 'America/Asuncion', 'America/Cayenne', 'America/Miquelon', 'America/Montevideo', 'America/Paramaribo', 'America/Punta_Arenas', 'America/Coyhaique', 'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Fortaleza', 'America/Maceio', 'America/Recife', 'America/Santarem', 'Brazil/East', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Atlantic/Stanley', 'America/Noronha', 'Brazil/DeNoronha', 'America/Nuuk', 'America/Scoresbysund', 'America/Godthab', 'Africa/Abidjan', 'Iceland', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Atlantic/Reykjavik', 'Atlantic/St_Helena', 'Africa/Timbuktu', 'Africa/Bissau', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Monrovia', 'Africa/Sao_Tome', 'America/Danmarkshavn', 'Antarctica/Troll', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Faeroe', 'Europe/Dublin', 'Eire', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Europe/Lisbon', 'Atlantic/Madeira', 'Portugal', 'WET', 'GB', 'GB-Eire', 'Europe/Belfast', 'Africa/Algiers', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Ndjamena', 'Africa/Tunis', 'Africa/Windhoek', 'Arctic/Longyearbyen', 'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Belgrade', 'Europe/Ljubljana', 'Europe/Podgorica', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Zagreb', 'Europe/Busingen', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Atlantic/Jan_Mayen', 'Europe/Bratislava', 'Europe/Brussels', 'CET', 'MET', 'Europe/Luxembourg', 'Europe/Budapest', 'Europe/Gibraltar', 'Europe/Madrid', 'Africa/Ceuta', 'Europe/Malta', 'Europe/Monaco', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Tirane', 'Europe/Vaduz', 'Europe/Vienna', 'Europe/Warsaw', 'Poland', 'Europe/Zurich', 'Africa/Blantyre', 'Africa/Bujumbura', 'Egypt', 'Africa/Gaborone', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Juba', 'Africa/Khartoum', 'Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Tripoli', 'Libya', 'Asia/Beirut', 'Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Israel', 'Asia/Tel_Aviv', 'Asia/Nicosia', 'Asia/Famagusta', 'Europe/Nicosia', 'EET', 'Europe/Bucharest', 'Europe/Chisinau', 'Europe/Tiraspol', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kiev', 'Europe/Riga', 'Europe/Sofia', 'Europe/Tallinn', 'Europe/Vilnius', 'Africa/Addis_Ababa', 'Africa/Asmara', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Nairobi', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte', 'Africa/Asmera', 'Antarctica/Syowa', 'Asia/Aden', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Damascus', 'Asia/Kuwait', 'Asia/Qatar', 'Europe/Istanbul', 'Turkey', 'Asia/Istanbul', 'Europe/Minsk', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU', 'Europe/Simferopol', 'Asia/Tehran', 'Iran', 'Asia/Muscat', 'Indian/Mahe', 'Indian/Reunion', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Samara', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Indian/Mauritius', 'Asia/Kabul', 'Antarctica/Mawson', 'Antarctica/Vostok', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Ashgabat', 'Asia/Ashkhabad', 'Asia/Dushanbe', 'Asia/Samarkand', 'Asia/Yekaterinburg', 'Indian/Kerguelen', 'Indian/Maldives', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Bishkek', 'Asia/Dacca', 'Asia/Omsk', 'Asia/Thimphu', 'Asia/Thimbu', 'Asia/Urumqi', 'Asia/Kashgar', 'Indian/Chagos', 'Asia/Yangon', 'Indian/Cocos', 'Asia/Rangoon', 'Antarctica/Davis', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Indian/Christmas', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Hovd', 'Asia/Pontianak', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk', 'Asia/Novokuznetsk', 'Asia/Tomsk', 'Antarctica/Casey', 'Asia/Brunei', 'Asia/Hong_Kong', 'Hongkong', 'Asia/Irkutsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Macau', 'Asia/Macao', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Manila', 'PRC', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Chungking', 'Singapore', 'Asia/Taipei', 'ROC', 'Asia/Ulaanbaatar', 'Asia/Choibalsan', 'Asia/Ulan_Bator', 'Australia/Perth', 'Australia/West', 'Australia/Eucla', 'Asia/Chita', 'Asia/Khandyga', 'Asia/Yakutsk', 'Asia/Dili', 'Asia/Jayapura', 'Asia/Pyongyang', 'ROK', 'Japan', 'Pacific/Palau', 'Australia/Adelaide', 'Australia/Broken_Hill', 'Australia/South', 'Australia/Yancowinna', 'Australia/Darwin', 'Australia/North', 'Antarctica/DumontDUrville', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Australia/Lindeman', 'Australia/Queensland', 'Antarctica/Macquarie', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Tasmania', 'Australia/Currie', 'Australia/Victoria', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra', 'Pacific/Chuuk', 'Pacific/Saipan', 'Pacific/Port_Moresby', 'Pacific/Yap', 'Pacific/Truk', 'Australia/Lord_Howe', 'Australia/LHI', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Srednekolymsk', 'Pacific/Bougainville', 'Pacific/Efate', 'Pacific/Guadalcanal', 'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae', 'Pacific/Norfolk', 'Antarctica/McMurdo', 'Asia/Kamchatka', 'Asia/Anadyr', 'NZ', 'Antarctica/South_Pole', 'Pacific/Funafuti', 'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Nauru', 'Pacific/Tarawa', 'Pacific/Wake', 'Pacific/Wallis', 'Pacific/Chatham', 'NZ-CHAT', 'Pacific/Apia', 'Pacific/Fakaofo', 'Pacific/Kanton', 'Pacific/Enderbury', 'Pacific/Tongatapu', 'Pacific/Kiritimati', 'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10', 'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5', 'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12');
  CREATE TYPE "public"."enum_registrations_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_registrations_event_feedback" AS ENUM('confirmed', 'denied');
  CREATE TYPE "public"."enum_user_messages_status" AS ENUM('screening', 'delivered', 'spam', 'failed');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'purgeUserMessages' BEFORE 'screenSubmission';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'screenEventSubmission' BEFORE 'screenSubmission';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'screenUserMessage' BEFORE 'sendPostEventFollowUps';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'purgeUserMessages' BEFORE 'screenSubmission';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'screenEventSubmission' BEFORE 'screenSubmission';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'screenUserMessage' BEFORE 'sendPostEventFollowUps';
  CREATE TABLE "event_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"screening_result" jsonb,
  	"submitter_info" jsonb,
  	"event_id" integer,
  	"manager_id" integer,
  	"region_id" integer,
  	"title" varchar,
  	"proposed" jsonb,
  	"status" "enum_event_submissions_status" DEFAULT 'screening' NOT NULL,
  	"submitter_id" integer,
  	"region_hint" jsonb,
  	"reviewed_by_id" integer,
  	"reviewed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "registrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"event_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"starting_at" timestamp(3) with time zone,
  	"startingat_tz" "enum_registrations_startingat_tz",
  	"client_id" integer,
  	"locale" "enum_registrations_locale" DEFAULT 'en',
  	"questions" jsonb,
  	"uuid" varchar NOT NULL,
  	"mailing_list_subscribed_at" timestamp(3) with time zone,
  	"reminders_unsubscribed_at" timestamp(3) with time zone,
  	"activity_log" jsonb,
  	"event_feedback" "enum_registrations_event_feedback",
  	"follow_up_sent_at" timestamp(3) with time zone,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "user_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"screening_result" jsonb,
  	"subject" varchar DEFAULT 'Message',
  	"message" varchar NOT NULL,
  	"sender_email" varchar,
  	"context" jsonb,
  	"client_id" integer,
  	"user_id" integer,
  	"status" "enum_user_messages_status" DEFAULT 'screening' NOT NULL,
  	"body_hash" varchar,
  	"delivered_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_submissions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "registrations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_messages_id" integer;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_reviewed_by_id_managers_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "registrations" ADD CONSTRAINT "registrations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "event_submissions_event_idx" ON "event_submissions" USING btree ("event_id");
  CREATE INDEX "event_submissions_manager_idx" ON "event_submissions" USING btree ("manager_id");
  CREATE INDEX "event_submissions_region_idx" ON "event_submissions" USING btree ("region_id");
  CREATE INDEX "event_submissions_submitter_idx" ON "event_submissions" USING btree ("submitter_id");
  CREATE INDEX "event_submissions_reviewed_by_idx" ON "event_submissions" USING btree ("reviewed_by_id");
  CREATE INDEX "event_submissions_updated_at_idx" ON "event_submissions" USING btree ("updated_at");
  CREATE INDEX "event_submissions_created_at_idx" ON "event_submissions" USING btree ("created_at");
  CREATE INDEX "registrations_event_idx" ON "registrations" USING btree ("event_id");
  CREATE INDEX "registrations_user_idx" ON "registrations" USING btree ("user_id");
  CREATE INDEX "registrations_client_idx" ON "registrations" USING btree ("client_id");
  CREATE UNIQUE INDEX "registrations_uuid_idx" ON "registrations" USING btree ("uuid");
  CREATE INDEX "registrations_legacy_id_idx" ON "registrations" USING btree ("legacy_id");
  CREATE INDEX "registrations_updated_at_idx" ON "registrations" USING btree ("updated_at");
  CREATE INDEX "registrations_created_at_idx" ON "registrations" USING btree ("created_at");
  CREATE INDEX "user_messages_sender_email_idx" ON "user_messages" USING btree ("sender_email");
  CREATE INDEX "user_messages_client_idx" ON "user_messages" USING btree ("client_id");
  CREATE INDEX "user_messages_user_idx" ON "user_messages" USING btree ("user_id");
  CREATE INDEX "user_messages_body_hash_idx" ON "user_messages" USING btree ("body_hash");
  CREATE INDEX "user_messages_updated_at_idx" ON "user_messages" USING btree ("updated_at");
  CREATE INDEX "user_messages_created_at_idx" ON "user_messages" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_submissions_fk" FOREIGN KEY ("event_submissions_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_registrations_fk" FOREIGN KEY ("registrations_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_messages_fk" FOREIGN KEY ("user_messages_id") REFERENCES "public"."user_messages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_event_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("event_submissions_id");
  CREATE INDEX "payload_locked_documents_rels_registrations_id_idx" ON "payload_locked_documents_rels" USING btree ("registrations_id");
  CREATE INDEX "payload_locked_documents_rels_user_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("user_messages_id");`)
}
