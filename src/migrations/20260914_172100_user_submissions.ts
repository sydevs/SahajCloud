import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_forms_action_type" AS ENUM('contact', 'subscribe');
  CREATE TYPE "public"."enum_user_submissions_type" AS ENUM('contact', 'subscribe', 'registration', 'proposal');
  CREATE TYPE "public"."enum_user_submissions_status" AS ENUM('pending', 'accepted', 'rejected', 'failed');
  CREATE TYPE "public"."enum_user_submissions_startingat_tz" AS ENUM('UTC', 'Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Pago_Pago', 'US/Samoa', 'Pacific/Samoa', 'America/Adak', 'US/Aleutian', 'America/Atka', 'US/Hawaii', 'Pacific/Johnston', 'HST', 'Pacific/Tahiti', 'Pacific/Marquesas', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska', 'US/Pacific', 'PST8PDT', 'Mexico/BajaNorte', 'America/Ensenada', 'America/Santa_Isabel', 'America/Vancouver', 'Canada/Pacific', 'Pacific/Pitcairn', 'America/Ciudad_Juarez', 'America/Boise', 'MST7MDT', 'Navajo', 'US/Mountain', 'America/Shiprock', 'America/Edmonton', 'America/Cambridge_Bay', 'America/Inuvik', 'Canada/Mountain', 'America/Yellowknife', 'America/Hermosillo', 'America/Mazatlan', 'Mexico/BajaSur', 'MST', 'US/Arizona', 'America/Creston', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'Canada/Yukon', 'America/Belize', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'CST6CDT', 'US/Central', 'US/Indiana-Starke', 'America/Knox_IN', 'America/Costa_Rica', 'America/El_Salvador', 'America/Managua', 'America/Matamoros', 'America/Ojinaga', 'America/Mexico_City', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Merida', 'America/Monterrey', 'Mexico/General', 'America/Regina', 'America/Swift_Current', 'Canada/Saskatchewan', 'America/Tegucigalpa', 'America/Winnipeg', 'America/Rankin_Inlet', 'America/Resolute', 'Canada/Central', 'America/Rainy_River', 'Pacific/Easter', 'Chile/EasterIsland', 'Pacific/Galapagos', 'America/Atikokan', 'America/Cancun', 'America/Cayman', 'America/Grand_Turk', 'America/Guayaquil', 'America/Havana', 'Cuba', 'America/Jamaica', 'Jamaica', 'America/Lima', 'America/Nassau', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'US/Michigan', 'US/East-Indiana', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville', 'EST5EDT', 'US/Eastern', 'America/Panama', 'EST', 'America/Coral_Harbour', 'America/Port-au-Prince', 'America/Rio_Branco', 'America/Eirunepe', 'Brazil/Acre', 'America/Porto_Acre', 'America/Toronto', 'America/Iqaluit', 'America/Pangnirtung', 'Canada/Eastern', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Anguilla', 'America/Antigua', 'America/Aruba', 'America/Barbados', 'America/Blanc-Sablon', 'America/Curacao', 'America/Dominica', 'America/Grenada', 'America/Guadeloupe', 'America/Guyana', 'America/Halifax', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Moncton', 'Canada/Atlantic', 'America/Kralendijk', 'America/La_Paz', 'America/Lower_Princes', 'America/Manaus', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Porto_Velho', 'Brazil/West', 'America/Marigot', 'America/Martinique', 'America/Montserrat', 'America/Port_of_Spain', 'America/Puerto_Rico', 'America/Virgin', 'America/St_Barthelemy', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas', 'America/St_Vincent', 'America/Tortola', 'Chile/Continental', 'America/Santo_Domingo', 'America/Thule', 'Atlantic/Bermuda', 'America/St_Johns', 'Canada/Newfoundland', 'America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Catamarca', 'America/Argentina/ComodRivadavia', 'America/Cordoba', 'America/Rosario', 'America/Jujuy', 'America/Mendoza', 'America/Asuncion', 'America/Cayenne', 'America/Miquelon', 'America/Montevideo', 'America/Paramaribo', 'America/Punta_Arenas', 'America/Coyhaique', 'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Fortaleza', 'America/Maceio', 'America/Recife', 'America/Santarem', 'Brazil/East', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Atlantic/Stanley', 'America/Noronha', 'Brazil/DeNoronha', 'America/Nuuk', 'America/Scoresbysund', 'America/Godthab', 'Africa/Abidjan', 'Iceland', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Atlantic/Reykjavik', 'Atlantic/St_Helena', 'Africa/Timbuktu', 'Africa/Bissau', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Monrovia', 'Africa/Sao_Tome', 'America/Danmarkshavn', 'Antarctica/Troll', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Faeroe', 'Europe/Dublin', 'Eire', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Europe/Lisbon', 'Atlantic/Madeira', 'Portugal', 'WET', 'GB', 'GB-Eire', 'Europe/Belfast', 'Africa/Algiers', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Ndjamena', 'Africa/Tunis', 'Africa/Windhoek', 'Arctic/Longyearbyen', 'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Belgrade', 'Europe/Ljubljana', 'Europe/Podgorica', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Zagreb', 'Europe/Busingen', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Atlantic/Jan_Mayen', 'Europe/Bratislava', 'Europe/Brussels', 'CET', 'MET', 'Europe/Luxembourg', 'Europe/Budapest', 'Europe/Gibraltar', 'Europe/Madrid', 'Africa/Ceuta', 'Europe/Malta', 'Europe/Monaco', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Tirane', 'Europe/Vaduz', 'Europe/Vienna', 'Europe/Warsaw', 'Poland', 'Europe/Zurich', 'Africa/Blantyre', 'Africa/Bujumbura', 'Egypt', 'Africa/Gaborone', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Juba', 'Africa/Khartoum', 'Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Tripoli', 'Libya', 'Asia/Beirut', 'Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Israel', 'Asia/Tel_Aviv', 'Asia/Nicosia', 'Asia/Famagusta', 'Europe/Nicosia', 'EET', 'Europe/Bucharest', 'Europe/Chisinau', 'Europe/Tiraspol', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kiev', 'Europe/Riga', 'Europe/Sofia', 'Europe/Tallinn', 'Europe/Vilnius', 'Africa/Addis_Ababa', 'Africa/Asmara', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Nairobi', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte', 'Africa/Asmera', 'Antarctica/Syowa', 'Asia/Aden', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Damascus', 'Asia/Kuwait', 'Asia/Qatar', 'Europe/Istanbul', 'Turkey', 'Asia/Istanbul', 'Europe/Minsk', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU', 'Europe/Simferopol', 'Asia/Tehran', 'Iran', 'Asia/Muscat', 'Indian/Mahe', 'Indian/Reunion', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Samara', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Indian/Mauritius', 'Asia/Kabul', 'Antarctica/Mawson', 'Antarctica/Vostok', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Ashgabat', 'Asia/Ashkhabad', 'Asia/Dushanbe', 'Asia/Samarkand', 'Asia/Yekaterinburg', 'Indian/Kerguelen', 'Indian/Maldives', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Bishkek', 'Asia/Dacca', 'Asia/Omsk', 'Asia/Thimphu', 'Asia/Thimbu', 'Asia/Urumqi', 'Asia/Kashgar', 'Indian/Chagos', 'Asia/Yangon', 'Indian/Cocos', 'Asia/Rangoon', 'Antarctica/Davis', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Indian/Christmas', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Hovd', 'Asia/Pontianak', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk', 'Asia/Novokuznetsk', 'Asia/Tomsk', 'Antarctica/Casey', 'Asia/Brunei', 'Asia/Hong_Kong', 'Hongkong', 'Asia/Irkutsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Macau', 'Asia/Macao', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Manila', 'PRC', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Chungking', 'Singapore', 'Asia/Taipei', 'ROC', 'Asia/Ulaanbaatar', 'Asia/Choibalsan', 'Asia/Ulan_Bator', 'Australia/Perth', 'Australia/West', 'Australia/Eucla', 'Asia/Chita', 'Asia/Khandyga', 'Asia/Yakutsk', 'Asia/Dili', 'Asia/Jayapura', 'Asia/Pyongyang', 'ROK', 'Japan', 'Pacific/Palau', 'Australia/Adelaide', 'Australia/Broken_Hill', 'Australia/South', 'Australia/Yancowinna', 'Australia/Darwin', 'Australia/North', 'Antarctica/DumontDUrville', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Australia/Lindeman', 'Australia/Queensland', 'Antarctica/Macquarie', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Tasmania', 'Australia/Currie', 'Australia/Victoria', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra', 'Pacific/Chuuk', 'Pacific/Saipan', 'Pacific/Port_Moresby', 'Pacific/Yap', 'Pacific/Truk', 'Australia/Lord_Howe', 'Australia/LHI', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Srednekolymsk', 'Pacific/Bougainville', 'Pacific/Efate', 'Pacific/Guadalcanal', 'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae', 'Pacific/Norfolk', 'Antarctica/McMurdo', 'Asia/Kamchatka', 'Asia/Anadyr', 'NZ', 'Antarctica/South_Pole', 'Pacific/Funafuti', 'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Nauru', 'Pacific/Tarawa', 'Pacific/Wake', 'Pacific/Wallis', 'Pacific/Chatham', 'NZ-CHAT', 'Pacific/Apia', 'Pacific/Fakaofo', 'Pacific/Kanton', 'Pacific/Enderbury', 'Pacific/Tongatapu', 'Pacific/Kiritimati', 'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10', 'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5', 'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12');
  CREATE TYPE "public"."enum_user_submissions_event_feedback" AS ENUM('confirmed', 'denied');
  ALTER TABLE "forms_emails" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_emails_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "forms_emails" CASCADE;
  DROP TABLE "forms_emails_locales" CASCADE;
  ALTER TABLE "form_submissions_submission_data" RENAME TO "user_submissions_submission_data";
  ALTER TABLE "form_submissions" RENAME TO "user_submissions";
  ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "form_submissions_id" TO "user_submissions_id";
  ALTER TABLE "user_submissions_submission_data" DROP CONSTRAINT "form_submissions_submission_data_parent_id_fk";
  
  ALTER TABLE "user_submissions" DROP CONSTRAINT "form_submissions_form_id_forms_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_form_submissions_fk";
  
  DROP INDEX "form_submissions_submission_data_order_idx";
  DROP INDEX "form_submissions_submission_data_parent_id_idx";
  DROP INDEX "form_submissions_form_idx";
  DROP INDEX "form_submissions_updated_at_idx";
  DROP INDEX "form_submissions_created_at_idx";
  DROP INDEX "payload_locked_documents_rels_form_submissions_id_idx";
  ALTER TABLE "user_submissions" ALTER COLUMN "form_id" DROP NOT NULL;
  ALTER TABLE "forms" ADD COLUMN "action_type" "enum_forms_action_type" DEFAULT 'contact' NOT NULL;
  ALTER TABLE "forms" ADD COLUMN "recipient_id" integer;
  ALTER TABLE "forms" ADD COLUMN "client_id" integer;
  ALTER TABLE "user_submissions" ADD COLUMN "type" "enum_user_submissions_type" DEFAULT 'contact' NOT NULL;
  ALTER TABLE "user_submissions" ADD COLUMN "subject" varchar;
  ALTER TABLE "user_submissions" ADD COLUMN "sender_email" varchar;
  ALTER TABLE "user_submissions" ADD COLUMN "status" "enum_user_submissions_status" DEFAULT 'pending' NOT NULL;
  ALTER TABLE "user_submissions" ADD COLUMN "event_id" integer;
  ALTER TABLE "user_submissions" ADD COLUMN "starting_at" timestamp(3) with time zone;
  ALTER TABLE "user_submissions" ADD COLUMN "startingat_tz" "enum_user_submissions_startingat_tz";
  ALTER TABLE "user_submissions" ADD COLUMN "event_feedback" "enum_user_submissions_event_feedback";
  ALTER TABLE "user_submissions" ADD COLUMN "proposed" jsonb;
  ALTER TABLE "user_submissions" ADD COLUMN "screening_result" jsonb;
  ALTER TABLE "user_submissions" ADD COLUMN "activity_log" jsonb;
  ALTER TABLE "user_submissions" ADD COLUMN "uuid" varchar;
  ALTER TABLE "user_submissions" ADD COLUMN "client_id" integer;
  ALTER TABLE "user_submissions" ADD COLUMN "user_id" integer;
  ALTER TABLE "user_submissions" ADD COLUMN "unsubscribed_at" timestamp(3) with time zone;
  ALTER TABLE "user_submissions" ADD COLUMN "follow_up_sent_at" timestamp(3) with time zone;
  ALTER TABLE "forms" ADD CONSTRAINT "forms_recipient_id_managers_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forms" ADD CONSTRAINT "forms_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions_submission_data" ADD CONSTRAINT "user_submissions_submission_data_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."user_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_submissions_fk" FOREIGN KEY ("user_submissions_id") REFERENCES "public"."user_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "forms_action_type_idx" ON "forms" USING btree ("action_type");
  CREATE INDEX "forms_recipient_idx" ON "forms" USING btree ("recipient_id");
  CREATE INDEX "forms_client_idx" ON "forms" USING btree ("client_id");
  CREATE INDEX "user_submissions_submission_data_order_idx" ON "user_submissions_submission_data" USING btree ("_order");
  CREATE INDEX "user_submissions_submission_data_parent_id_idx" ON "user_submissions_submission_data" USING btree ("_parent_id");
  CREATE INDEX "user_submissions_type_idx" ON "user_submissions" USING btree ("type");
  CREATE INDEX "user_submissions_form_idx" ON "user_submissions" USING btree ("form_id");
  CREATE INDEX "user_submissions_sender_email_idx" ON "user_submissions" USING btree ("sender_email");
  CREATE INDEX "user_submissions_status_idx" ON "user_submissions" USING btree ("status");
  CREATE INDEX "user_submissions_event_idx" ON "user_submissions" USING btree ("event_id");
  CREATE UNIQUE INDEX "user_submissions_uuid_idx" ON "user_submissions" USING btree ("uuid");
  CREATE INDEX "user_submissions_client_idx" ON "user_submissions" USING btree ("client_id");
  CREATE INDEX "user_submissions_user_idx" ON "user_submissions" USING btree ("user_id");
  CREATE INDEX "user_submissions_unsubscribed_at_idx" ON "user_submissions" USING btree ("unsubscribed_at");
  CREATE INDEX "user_submissions_updated_at_idx" ON "user_submissions" USING btree ("updated_at");
  CREATE INDEX "user_submissions_created_at_idx" ON "user_submissions" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_user_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("user_submissions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "forms_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"email_to" varchar,
  	"cc" varchar,
  	"bcc" varchar,
  	"reply_to" varchar,
  	"email_from" varchar
  );
  
  CREATE TABLE "forms_emails_locales" (
  	"subject" varchar DEFAULT 'You''ve received a new message.' NOT NULL,
  	"message" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  ALTER TABLE "user_submissions_submission_data" RENAME TO "form_submissions_submission_data";
  ALTER TABLE "user_submissions" RENAME TO "form_submissions";
  ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "user_submissions_id" TO "form_submissions_id";
  ALTER TABLE "forms" DROP CONSTRAINT "forms_recipient_id_managers_id_fk";
  
  ALTER TABLE "forms" DROP CONSTRAINT "forms_client_id_clients_id_fk";
  
  ALTER TABLE "form_submissions_submission_data" DROP CONSTRAINT "user_submissions_submission_data_parent_id_fk";
  
  ALTER TABLE "form_submissions" DROP CONSTRAINT "user_submissions_form_id_forms_id_fk";
  
  ALTER TABLE "form_submissions" DROP CONSTRAINT "user_submissions_event_id_events_id_fk";
  
  ALTER TABLE "form_submissions" DROP CONSTRAINT "user_submissions_client_id_clients_id_fk";
  
  ALTER TABLE "form_submissions" DROP CONSTRAINT "user_submissions_user_id_users_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_submissions_fk";
  
  DROP INDEX "forms_action_type_idx";
  DROP INDEX "forms_recipient_idx";
  DROP INDEX "forms_client_idx";
  DROP INDEX "user_submissions_submission_data_order_idx";
  DROP INDEX "user_submissions_submission_data_parent_id_idx";
  DROP INDEX "user_submissions_type_idx";
  DROP INDEX "user_submissions_form_idx";
  DROP INDEX "user_submissions_sender_email_idx";
  DROP INDEX "user_submissions_status_idx";
  DROP INDEX "user_submissions_event_idx";
  DROP INDEX "user_submissions_uuid_idx";
  DROP INDEX "user_submissions_client_idx";
  DROP INDEX "user_submissions_user_idx";
  DROP INDEX "user_submissions_unsubscribed_at_idx";
  DROP INDEX "user_submissions_updated_at_idx";
  DROP INDEX "user_submissions_created_at_idx";
  DROP INDEX "payload_locked_documents_rels_user_submissions_id_idx";
  ALTER TABLE "form_submissions" ALTER COLUMN "form_id" SET NOT NULL;
  ALTER TABLE "forms_emails" ADD CONSTRAINT "forms_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_emails_locales" ADD CONSTRAINT "forms_emails_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_emails"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "forms_emails_order_idx" ON "forms_emails" USING btree ("_order");
  CREATE INDEX "forms_emails_parent_id_idx" ON "forms_emails" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "forms_emails_locales_locale_parent_id_unique" ON "forms_emails_locales" USING btree ("_locale","_parent_id");
  ALTER TABLE "form_submissions_submission_data" ADD CONSTRAINT "form_submissions_submission_data_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_submissions_fk" FOREIGN KEY ("form_submissions_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "form_submissions_submission_data_order_idx" ON "form_submissions_submission_data" USING btree ("_order");
  CREATE INDEX "form_submissions_submission_data_parent_id_idx" ON "form_submissions_submission_data" USING btree ("_parent_id");
  CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id");
  CREATE INDEX "form_submissions_updated_at_idx" ON "form_submissions" USING btree ("updated_at");
  CREATE INDEX "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_submissions_id");
  ALTER TABLE "forms" DROP COLUMN "action_type";
  ALTER TABLE "forms" DROP COLUMN "recipient_id";
  ALTER TABLE "forms" DROP COLUMN "client_id";
  ALTER TABLE "form_submissions" DROP COLUMN "type";
  ALTER TABLE "form_submissions" DROP COLUMN "subject";
  ALTER TABLE "form_submissions" DROP COLUMN "sender_email";
  ALTER TABLE "form_submissions" DROP COLUMN "status";
  ALTER TABLE "form_submissions" DROP COLUMN "event_id";
  ALTER TABLE "form_submissions" DROP COLUMN "starting_at";
  ALTER TABLE "form_submissions" DROP COLUMN "startingat_tz";
  ALTER TABLE "form_submissions" DROP COLUMN "event_feedback";
  ALTER TABLE "form_submissions" DROP COLUMN "proposed";
  ALTER TABLE "form_submissions" DROP COLUMN "screening_result";
  ALTER TABLE "form_submissions" DROP COLUMN "activity_log";
  ALTER TABLE "form_submissions" DROP COLUMN "uuid";
  ALTER TABLE "form_submissions" DROP COLUMN "client_id";
  ALTER TABLE "form_submissions" DROP COLUMN "user_id";
  ALTER TABLE "form_submissions" DROP COLUMN "unsubscribed_at";
  ALTER TABLE "form_submissions" DROP COLUMN "follow_up_sent_at";
  DROP TYPE "public"."enum_forms_action_type";
  DROP TYPE "public"."enum_user_submissions_type";
  DROP TYPE "public"."enum_user_submissions_status";
  DROP TYPE "public"."enum_user_submissions_startingat_tz";
  DROP TYPE "public"."enum_user_submissions_event_feedback";`)
}
