import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_pages_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_meditations_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_meditations_type" AS ENUM('daily', 'lesson');
  CREATE TYPE "public"."enum_meditations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__meditations_v_version_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum__meditations_v_version_type" AS ENUM('daily', 'lesson');
  CREATE TYPE "public"."enum__meditations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__meditations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_videos_tags" AS ENUM('testimonial', 'workshop', 'event', 'technique');
  CREATE TYPE "public"."enum_lessons_unit" AS ENUM('Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6', 'Unit 7');
  CREATE TYPE "public"."enum_lectures_subtitles_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_lectures_type" AS ENUM('full', 'clip');
  CREATE TYPE "public"."enum_frames_tags" AS ENUM('anahat', 'back', 'bandhan', 'both hands', 'center', 'channel', 'clearing', 'earth', 'ego', 'feel', 'ham ksham', 'hamsa', 'hand', 'hands', 'left', 'lefthanded', 'massage', 'meditate', 'namaste', 'raise', 'ready', 'right', 'righthanded', 'rising', 'silent', 'superego', 'tapping');
  CREATE TYPE "public"."enum_frames_image_set" AS ENUM('male', 'female');
  CREATE TYPE "public"."enum_narrators_gender" AS ENUM('male', 'female');
  CREATE TYPE "public"."enum_images_tags" AS ENUM('landscape', 'portrait', 'square', 'thumbnail', 'author', 'icon', 'stock-photo', 'technique', 'meditation', 'placeholder', 'lesson', 'app-card');
  CREATE TYPE "public"."enum_audiences_location_countries" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CX', 'CC', 'CO', 'KM', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'CD', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IQ', 'IE', 'IR', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'KP', 'MP', 'NO', 'OM', 'PK', 'PW', 'PA', 'PG', 'PY', 'CN', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'CG', 'GM', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'KR', 'SS', 'ES', 'LK', 'PS', 'SD', 'SR', 'SJ', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TH', 'MK', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'TZ', 'UM', 'US', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  CREATE TYPE "public"."enum_user_choices_timings" AS ENUM('morning', 'afternoon', 'evening', 'night');
  CREATE TYPE "public"."enum_user_choices_type" AS ENUM('mood', 'goal', 'duration');
  CREATE TYPE "public"."enum_subtle_system_nodes_slug" AS ENUM('mooladhara', 'swadhistan', 'nabhi', 'void', 'anahat', 'vishuddhi', 'agnya', 'sahasrara', 'kundalini', 'pingala', 'ida', 'sushumna');
  CREATE TYPE "public"."enum_managers_roles" AS ENUM('meditations-editor', 'path-editor', 'web-translator');
  CREATE TYPE "public"."enum_managers_current_project" AS ENUM('', 'wemeditate-web', 'wemeditate-app', 'sahaj-atlas');
  CREATE TYPE "public"."enum_managers_type" AS ENUM('inactive', 'manager', 'admin');
  CREATE TYPE "public"."enum_clients_roles" AS ENUM('wemeditate-web-client', 'wemeditate-app-client', 'sahaj-atlas-client');
  CREATE TYPE "public"."enum_app_cards_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_app_cards_target_sections" AS ENUM('hero', 'highlights', 'lectures');
  CREATE TYPE "public"."enum_app_cards_timings" AS ENUM('morning', 'afternoon', 'evening', 'night');
  CREATE TYPE "public"."enum_app_cards_type" AS ENUM('standard', 'event');
  CREATE TYPE "public"."enum_app_cards_default_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum_app_cards_default_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum_app_cards_default_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum_app_cards_default_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum_app_cards_starting_soon_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum_app_cards_starting_soon_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum_app_cards_starting_soon_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum_app_cards_starting_soon_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum_app_cards_live_now_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum_app_cards_live_now_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum_app_cards_live_now_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum_app_cards_live_now_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum_app_cards_schedule_firstdate_tz" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TYPE "public"."enum_app_cards_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum_app_cards_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__app_cards_v_version_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum__app_cards_v_version_target_sections" AS ENUM('hero', 'highlights', 'lectures');
  CREATE TYPE "public"."enum__app_cards_v_version_timings" AS ENUM('morning', 'afternoon', 'evening', 'night');
  CREATE TYPE "public"."enum__app_cards_v_version_type" AS ENUM('standard', 'event');
  CREATE TYPE "public"."enum__app_cards_v_version_default_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum__app_cards_v_version_default_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum__app_cards_v_version_default_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum__app_cards_v_version_default_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum__app_cards_v_version_schedule_firstdate_tz" AS ENUM('Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji');
  CREATE TYPE "public"."enum__app_cards_v_version_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum__app_cards_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__app_cards_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_forms_confirmation_type" AS ENUM('message', 'redirect');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'cleanupOrphanedMedia', 'syncLectureMetadata', 'resetUsage', 'schedulePublish');
  CREATE TYPE "public"."enum_wm_web_translations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__wm_web_translations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__wm_web_translations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_wm_app_config_vibe_check_tracks_identifier" AS ENUM('WHAT-YOU-FEEL-START', 'WHAT-YOU-FEEL-LEFT', 'WHAT-YOU-FEEL-RIGHT', 'INTRO-INTERPRET', 'BH-COOL', 'SOMETHING-NO-COOL', 'SOMETHING-COOL', 'BH-NOTHING');
  CREATE TYPE "public"."enum_wm_app_translations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__wm_app_translations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__wm_app_translations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TYPE "public"."enum_wm_app_status_baseline_country" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CX', 'CC', 'CO', 'KM', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'CD', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IQ', 'IE', 'IR', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'KP', 'MP', 'NO', 'OM', 'PK', 'PW', 'PA', 'PG', 'PY', 'CN', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'CG', 'GM', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'KR', 'SS', 'ES', 'LK', 'PS', 'SD', 'SR', 'SJ', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TH', 'MK', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'TZ', 'UM', 'US', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  CREATE TYPE "public"."enum_sy_atlas_translations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__sy_atlas_translations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__sy_atlas_translations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-br', 'fa', 'bg', 'tr');
  CREATE TABLE "pages_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_pages_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar,
  	"author_id" integer,
  	"featured_video_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar,
  	"content" jsonb,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_version_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__pages_v_version_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_generate_slug" boolean DEFAULT true,
  	"version_slug" varchar,
  	"version_author_id" integer,
  	"version_featured_video_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__pages_v_published_locale",
  	"latest" boolean,
  	"autosave" boolean
  );
  
  CREATE TABLE "_pages_v_locales" (
  	"version_title" varchar,
  	"version_content" jsonb,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "meditations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"locale" "enum_meditations_locale",
  	"narrator_id" integer,
  	"song_tag_id" integer,
  	"duration" numeric,
  	"subtle_system_node_weights" jsonb,
  	"thumbnail_id" integer,
  	"type" "enum_meditations_type" DEFAULT 'daily',
  	"frames" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_meditations_status" DEFAULT 'draft',
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "_meditations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_label" varchar,
  	"version_locale" "enum__meditations_v_version_locale",
  	"version_narrator_id" integer,
  	"version_song_tag_id" integer,
  	"version_duration" numeric,
  	"version_subtle_system_node_weights" jsonb,
  	"version_thumbnail_id" integer,
  	"version_type" "enum__meditations_v_version_type" DEFAULT 'daily',
  	"version_frames" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__meditations_v_version_status" DEFAULT 'draft',
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__meditations_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "songs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"album_id" integer NOT NULL,
  	"include_for_meditations" boolean DEFAULT true,
  	"file_metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "songs_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "songs_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"song_tags_id" integer
  );
  
  CREATE TABLE "albums" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"artwork_id" integer NOT NULL,
  	"artist_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "albums_locales" (
  	"title" varchar NOT NULL,
  	"artist" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "videos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"thumbnail_id" integer,
  	"subtitles" jsonb,
  	"tags" "enum_videos_tags" NOT NULL,
  	"file_metadata" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "videos_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "lessons_panels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"media_id" integer,
  	"subtitles" jsonb
  );
  
  CREATE TABLE "lessons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"intro_audio_id" integer,
  	"intro_subtitles" jsonb,
  	"unit" "enum_lessons_unit" NOT NULL,
  	"step" numeric NOT NULL,
  	"icon_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "lessons_locales" (
  	"pre_meditation_lines" varchar,
  	"article" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "lessons_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"locale" "_locales",
  	"meditations_id" integer,
  	"videos_id" integer,
  	"lectures_id" integer
  );
  
  CREATE TABLE "lectures_subtitles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"locale" "enum_lectures_subtitles_locale",
  	"url" varchar
  );
  
  CREATE TABLE "lectures" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_lectures_type" DEFAULT 'full' NOT NULL,
  	"nirmal_vidya_vimeo_url" varchar,
  	"thumbnail_id" integer,
  	"start_time" numeric,
  	"stop_time" numeric,
  	"metadata" jsonb,
  	"full_lecture_id" integer,
  	"priority" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lectures_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "lectures_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"audiences_id" integer,
  	"user_choices_id" integer,
  	"subtle_system_nodes_id" integer
  );
  
  CREATE TABLE "frames_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_frames_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "frames" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_set" "enum_frames_image_set" NOT NULL,
  	"subtle_system_node_id" integer,
  	"label" varchar,
  	"duration" numeric,
  	"file_metadata" jsonb DEFAULT '{}'::jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "narrators" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"gender" "enum_narrators_gender" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "authors" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"country_code" varchar,
  	"years_meditating" numeric,
  	"photo_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "authors_locales" (
  	"name" varchar NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "images_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_images_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"file_metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "images_locales" (
  	"alt" varchar NOT NULL,
  	"credit" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "audiences_location_countries" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_audiences_location_countries",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "audiences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"path_progress_min" numeric,
  	"path_progress_max" numeric,
  	"meditations_per_week_min" numeric,
  	"meditations_per_week_max" numeric,
  	"total_meditations_viewed_min" numeric,
  	"total_meditations_viewed_max" numeric,
  	"total_lectures_viewed_min" numeric,
  	"total_lectures_viewed_max" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "user_choices_timings" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_user_choices_timings",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "user_choices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"type" "enum_user_choices_type" DEFAULT 'mood' NOT NULL,
  	"color" varchar DEFAULT '#000000',
  	"parent_id" integer,
  	"is_featured" boolean DEFAULT false,
  	"order" numeric DEFAULT 1,
  	"is_parent" boolean DEFAULT false NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "user_choices_locales" (
  	"title" varchar,
  	"morning_meditation_id" integer,
  	"afternoon_meditation_id" integer,
  	"evening_meditation_id" integer,
  	"night_meditation_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "subtle_system_nodes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" "enum_subtle_system_nodes_slug" NOT NULL,
  	"page_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "song_tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "song_tags_locales" (
  	"title" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "managers_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_managers_roles",
  	"locale" "_locales" NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "managers_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "managers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"current_project" "enum_managers_current_project",
  	"type" "enum_managers_type" DEFAULT 'manager' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"_verified" boolean,
  	"_verificationtoken" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "managers_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer
  );
  
  CREATE TABLE "clients_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_clients_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"notes" varchar,
  	"primary_contact_id" integer NOT NULL,
  	"domains" varchar,
  	"active" boolean DEFAULT true,
  	"key_generated_at" timestamp(3) with time zone,
  	"usage_daily_requests" numeric DEFAULT 0,
  	"usage_peak_daily_requests" numeric DEFAULT 0,
  	"usage_last_request_at" timestamp(3) with time zone,
  	"usage_total_requests" numeric DEFAULT 0,
  	"usage_high_usage_days" numeric DEFAULT 0,
  	"usage_last_high_usage_at" timestamp(3) with time zone,
  	"usage_first_request_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar
  );
  
  CREATE TABLE "clients_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
  );
  
  CREATE TABLE "app_cards_schedule_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_app_cards_schedule_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "app_cards_schedule_exclusions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"reason" varchar
  );
  
  CREATE TABLE "app_cards_target_sections" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_app_cards_target_sections",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "app_cards_timings" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_app_cards_timings",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "app_cards" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"type" "enum_app_cards_type" DEFAULT 'standard',
  	"default_button_icon_id" integer,
  	"default_destination" "enum_app_cards_default_destination",
  	"default_page_id" integer,
  	"default_lecture_id" integer,
  	"default_album_id" integer,
  	"default_meditation_id" integer,
  	"default_image_id" integer,
  	"default_aspect_ratio" "enum_app_cards_default_aspect_ratio" DEFAULT 'square',
  	"default_text_color" "enum_app_cards_default_text_color" DEFAULT 'black',
  	"default_alignment" "enum_app_cards_default_alignment" DEFAULT 'center',
  	"starting_soon_enabled" boolean DEFAULT false,
  	"starting_soon_threshold" varchar DEFAULT '1:00',
  	"starting_soon_button_icon_id" integer,
  	"starting_soon_destination" "enum_app_cards_starting_soon_destination",
  	"starting_soon_page_id" integer,
  	"starting_soon_lecture_id" integer,
  	"starting_soon_album_id" integer,
  	"starting_soon_meditation_id" integer,
  	"starting_soon_image_id" integer,
  	"starting_soon_aspect_ratio" "enum_app_cards_starting_soon_aspect_ratio" DEFAULT 'square',
  	"starting_soon_text_color" "enum_app_cards_starting_soon_text_color" DEFAULT 'black',
  	"starting_soon_alignment" "enum_app_cards_starting_soon_alignment" DEFAULT 'center',
  	"live_now_enabled" boolean DEFAULT false,
  	"live_now_threshold" varchar DEFAULT '0:00',
  	"live_now_button_icon_id" integer,
  	"live_now_destination" "enum_app_cards_live_now_destination",
  	"live_now_page_id" integer,
  	"live_now_lecture_id" integer,
  	"live_now_album_id" integer,
  	"live_now_meditation_id" integer,
  	"live_now_image_id" integer,
  	"live_now_aspect_ratio" "enum_app_cards_live_now_aspect_ratio" DEFAULT 'square',
  	"live_now_text_color" "enum_app_cards_live_now_text_color" DEFAULT 'black',
  	"live_now_alignment" "enum_app_cards_live_now_alignment" DEFAULT 'center',
  	"schedule_first_date" timestamp(3) with time zone,
  	"schedule_firstdate_tz" "enum_app_cards_schedule_firstdate_tz",
  	"schedule_end_time" varchar,
  	"schedule_recurrence_type" "enum_app_cards_schedule_recurrence_type",
  	"schedule_interval" numeric DEFAULT 1,
  	"weight" numeric DEFAULT 3,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_app_cards_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "app_cards_locales" (
  	"default_header" varchar,
  	"default_title" varchar,
  	"default_subtitle" varchar,
  	"default_button_text" varchar,
  	"default_url" varchar,
  	"starting_soon_header" varchar,
  	"starting_soon_title" varchar,
  	"starting_soon_subtitle" varchar,
  	"starting_soon_button_text" varchar,
  	"starting_soon_url" varchar,
  	"live_now_header" varchar,
  	"live_now_title" varchar,
  	"live_now_subtitle" varchar,
  	"live_now_button_text" varchar,
  	"live_now_url" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "app_cards_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"audiences_id" integer
  );
  
  CREATE TABLE "_app_cards_v_version_schedule_weekdays" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__app_cards_v_version_schedule_weekdays",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_app_cards_v_version_schedule_exclusions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"start_date" timestamp(3) with time zone,
  	"end_date" timestamp(3) with time zone,
  	"reason" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_app_cards_v_version_target_sections" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__app_cards_v_version_target_sections",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_app_cards_v_version_timings" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__app_cards_v_version_timings",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_app_cards_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_label" varchar,
  	"version_type" "enum__app_cards_v_version_type" DEFAULT 'standard',
  	"version_default_button_icon_id" integer,
  	"version_default_destination" "enum__app_cards_v_version_default_destination",
  	"version_default_page_id" integer,
  	"version_default_lecture_id" integer,
  	"version_default_album_id" integer,
  	"version_default_meditation_id" integer,
  	"version_default_image_id" integer,
  	"version_default_aspect_ratio" "enum__app_cards_v_version_default_aspect_ratio" DEFAULT 'square',
  	"version_default_text_color" "enum__app_cards_v_version_default_text_color" DEFAULT 'black',
  	"version_default_alignment" "enum__app_cards_v_version_default_alignment" DEFAULT 'center',
  	"version_starting_soon_enabled" boolean DEFAULT false,
  	"version_starting_soon_threshold" varchar DEFAULT '1:00',
  	"version_starting_soon_button_icon_id" integer,
  	"version_starting_soon_destination" "enum__app_cards_v_version_starting_soon_destination",
  	"version_starting_soon_page_id" integer,
  	"version_starting_soon_lecture_id" integer,
  	"version_starting_soon_album_id" integer,
  	"version_starting_soon_meditation_id" integer,
  	"version_starting_soon_image_id" integer,
  	"version_starting_soon_aspect_ratio" "enum__app_cards_v_version_starting_soon_aspect_ratio" DEFAULT 'square',
  	"version_starting_soon_text_color" "enum__app_cards_v_version_starting_soon_text_color" DEFAULT 'black',
  	"version_starting_soon_alignment" "enum__app_cards_v_version_starting_soon_alignment" DEFAULT 'center',
  	"version_live_now_enabled" boolean DEFAULT false,
  	"version_live_now_threshold" varchar DEFAULT '0:00',
  	"version_live_now_button_icon_id" integer,
  	"version_live_now_destination" "enum__app_cards_v_version_live_now_destination",
  	"version_live_now_page_id" integer,
  	"version_live_now_lecture_id" integer,
  	"version_live_now_album_id" integer,
  	"version_live_now_meditation_id" integer,
  	"version_live_now_image_id" integer,
  	"version_live_now_aspect_ratio" "enum__app_cards_v_version_live_now_aspect_ratio" DEFAULT 'square',
  	"version_live_now_text_color" "enum__app_cards_v_version_live_now_text_color" DEFAULT 'black',
  	"version_live_now_alignment" "enum__app_cards_v_version_live_now_alignment" DEFAULT 'center',
  	"version_schedule_first_date" timestamp(3) with time zone,
  	"version_schedule_firstdate_tz" "enum__app_cards_v_version_schedule_firstdate_tz",
  	"version_schedule_end_time" varchar,
  	"version_schedule_recurrence_type" "enum__app_cards_v_version_schedule_recurrence_type",
  	"version_schedule_interval" numeric DEFAULT 1,
  	"version_weight" numeric DEFAULT 3,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__app_cards_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__app_cards_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_app_cards_v_locales" (
  	"version_default_header" varchar,
  	"version_default_title" varchar,
  	"version_default_subtitle" varchar,
  	"version_default_button_text" varchar,
  	"version_default_url" varchar,
  	"version_starting_soon_header" varchar,
  	"version_starting_soon_title" varchar,
  	"version_starting_soon_subtitle" varchar,
  	"version_starting_soon_button_text" varchar,
  	"version_starting_soon_url" varchar,
  	"version_live_now_header" varchar,
  	"version_live_now_title" varchar,
  	"version_live_now_subtitle" varchar,
  	"version_live_now_button_text" varchar,
  	"version_live_now_url" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_app_cards_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"audiences_id" integer
  );
  
  CREATE TABLE "forms_blocks_checkbox" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"required" boolean,
  	"default_value" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_checkbox_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_country" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_country_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_email" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_email_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_message" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_message_locales" (
  	"message" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_number" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"default_value" numeric,
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_number_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_select_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_select_options_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_select" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"placeholder" varchar,
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_select_locales" (
  	"label" varchar,
  	"default_value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_state" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_state_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_text_locales" (
  	"label" varchar,
  	"default_value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "forms_blocks_textarea" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"width" numeric,
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_textarea_locales" (
  	"label" varchar,
  	"default_value" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
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
  
  CREATE TABLE "forms" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"confirmation_type" "enum_forms_confirmation_type" DEFAULT 'message',
  	"redirect_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "forms_locales" (
  	"submit_button_label" varchar,
  	"confirmation_message" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "form_submissions_submission_data" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "form_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"form_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_jobs_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"executed_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone NOT NULL,
  	"task_slug" "enum_payload_jobs_log_task_slug" NOT NULL,
  	"task_i_d" varchar NOT NULL,
  	"input" jsonb,
  	"output" jsonb,
  	"state" "enum_payload_jobs_log_state" NOT NULL,
  	"error" jsonb
  );
  
  CREATE TABLE "payload_jobs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"input" jsonb,
  	"completed_at" timestamp(3) with time zone,
  	"total_tried" numeric DEFAULT 0,
  	"has_error" boolean DEFAULT false,
  	"error" jsonb,
  	"task_slug" "enum_payload_jobs_task_slug",
  	"queue" varchar DEFAULT 'default',
  	"wait_until" timestamp(3) with time zone,
  	"processing" boolean DEFAULT false,
  	"meta" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer,
  	"meditations_id" integer,
  	"songs_id" integer,
  	"albums_id" integer,
  	"videos_id" integer,
  	"lessons_id" integer,
  	"lectures_id" integer,
  	"frames_id" integer,
  	"narrators_id" integer,
  	"authors_id" integer,
  	"images_id" integer,
  	"files_id" integer,
  	"audiences_id" integer,
  	"user_choices_id" integer,
  	"subtle_system_nodes_id" integer,
  	"song_tags_id" integer,
  	"managers_id" integer,
  	"clients_id" integer,
  	"app_cards_id" integer,
  	"forms_id" integer,
  	"form_submissions_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer,
  	"clients_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "wm_web_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"home_page_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "wm_web_config_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer
  );
  
  CREATE TABLE "wm_web_translations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_status" "enum_wm_web_translations_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "wm_web_translations_locales" (
  	"common" jsonb,
  	"navigation" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_wm_web_translations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version__status" "enum__wm_web_translations_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__wm_web_translations_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_wm_web_translations_v_locales" (
  	"version_common" jsonb,
  	"version_navigation" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "wm_app_config_vibe_check_tracks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"identifier" "enum_wm_app_config_vibe_check_tracks_identifier" NOT NULL,
  	"audio_id" integer NOT NULL,
  	"subtitles_id" integer NOT NULL
  );
  
  CREATE TABLE "wm_app_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"classes_page_id" integer NOT NULL,
  	"live_meditations_page_id" integer NOT NULL,
  	"explore_page_id" integer NOT NULL,
  	"explore_deeper_page_id" integer NOT NULL,
  	"meditate_together_page_id" integer NOT NULL,
  	"techniques_page_id" integer NOT NULL,
  	"lectures_page_id" integer NOT NULL,
  	"lessons_page_id" integer NOT NULL,
  	"music_page_id" integer NOT NULL,
  	"shri_mataji_page_id" integer NOT NULL,
  	"sahaja_yoga_page_id" integer NOT NULL,
  	"subtle_system_page_id" integer NOT NULL,
  	"privacy_page_id" integer NOT NULL,
  	"terms_page_id" integer NOT NULL,
  	"fallback_lecture_id" integer,
  	"ios_app_url" varchar,
  	"android_app_url" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "wm_app_config_locales" (
  	"self_realization_meditation_id" integer,
  	"post_realization_lecture_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "wm_app_translations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_status" "enum_wm_app_translations_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "wm_app_translations_locales" (
  	"onboarding_welcome" jsonb,
  	"onboarding_welcome_legal_disclaimer" jsonb,
  	"onboarding_name" jsonb,
  	"onboarding_greeting" jsonb,
  	"onboarding_user_type" jsonb,
  	"onboarding_user_type_title" jsonb,
  	"onboarding_carousel" jsonb,
  	"onboarding_carousel_page_true_self_title" jsonb,
  	"onboarding_consent_modal" jsonb,
  	"onboarding_consent_modal_body_never_share" jsonb,
  	"onboarding_consent_modal_body_never_sell" jsonb,
  	"onboarding_consent_modal_body_intro" jsonb,
  	"daily_main" jsonb,
  	"daily_common" jsonb,
  	"daily_load_info" jsonb,
  	"path_overview" jsonb,
  	"path_info" jsonb,
  	"path_step_1" jsonb,
  	"path_step_2" jsonb,
  	"path_step_3" jsonb,
  	"path_step_4" jsonb,
  	"path_step_complete" jsonb,
  	"explore_overview" jsonb,
  	"explore_subtle_system" jsonb,
  	"explore_talks_intro" jsonb,
  	"explore_talks_list" jsonb,
  	"explore_talks_player" jsonb,
  	"profile_main" jsonb,
  	"profile_favourites" jsonb,
  	"profile_history" jsonb,
  	"profile_account" jsonb,
  	"profile_privacy_advertising" jsonb,
  	"profile_privacy_advertising_advertising_body_never_share" jsonb,
  	"profile_privacy_advertising_advertising_body_intro" jsonb,
  	"profile_contact" jsonb,
  	"meditation_intent" jsonb,
  	"meditation_reminder" jsonb,
  	"meditation_footsoak" jsonb,
  	"meditation_footsoak_description" jsonb,
  	"meditation_player" jsonb,
  	"meditation_vibes_check" jsonb,
  	"meditation_feedback" jsonb,
  	"auth_common" jsonb,
  	"auth_login" jsonb,
  	"auth_restore_password" jsonb,
  	"auth_restore_password_email_sent" jsonb,
  	"auth_create_account" jsonb,
  	"auth_create_account_consent_label" jsonb,
  	"navigation" jsonb,
  	"general" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_wm_app_translations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version__status" "enum__wm_app_translations_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__wm_app_translations_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_wm_app_translations_v_locales" (
  	"version_onboarding_welcome" jsonb,
  	"version_onboarding_welcome_legal_disclaimer" jsonb,
  	"version_onboarding_name" jsonb,
  	"version_onboarding_greeting" jsonb,
  	"version_onboarding_user_type" jsonb,
  	"version_onboarding_user_type_title" jsonb,
  	"version_onboarding_carousel" jsonb,
  	"version_onboarding_carousel_page_true_self_title" jsonb,
  	"version_onboarding_consent_modal" jsonb,
  	"version_onboarding_consent_modal_body_never_share" jsonb,
  	"version_onboarding_consent_modal_body_never_sell" jsonb,
  	"version_onboarding_consent_modal_body_intro" jsonb,
  	"version_daily_main" jsonb,
  	"version_daily_common" jsonb,
  	"version_daily_load_info" jsonb,
  	"version_path_overview" jsonb,
  	"version_path_info" jsonb,
  	"version_path_step_1" jsonb,
  	"version_path_step_2" jsonb,
  	"version_path_step_3" jsonb,
  	"version_path_step_4" jsonb,
  	"version_path_step_complete" jsonb,
  	"version_explore_overview" jsonb,
  	"version_explore_subtle_system" jsonb,
  	"version_explore_talks_intro" jsonb,
  	"version_explore_talks_list" jsonb,
  	"version_explore_talks_player" jsonb,
  	"version_profile_main" jsonb,
  	"version_profile_favourites" jsonb,
  	"version_profile_history" jsonb,
  	"version_profile_account" jsonb,
  	"version_profile_privacy_advertising" jsonb,
  	"version_profile_privacy_advertising_advertising_body_never_share" jsonb,
  	"version_profile_privacy_advertising_advertising_body_intro" jsonb,
  	"version_profile_contact" jsonb,
  	"version_meditation_intent" jsonb,
  	"version_meditation_reminder" jsonb,
  	"version_meditation_footsoak" jsonb,
  	"version_meditation_footsoak_description" jsonb,
  	"version_meditation_player" jsonb,
  	"version_meditation_vibes_check" jsonb,
  	"version_meditation_feedback" jsonb,
  	"version_auth_common" jsonb,
  	"version_auth_login" jsonb,
  	"version_auth_restore_password" jsonb,
  	"version_auth_restore_password_email_sent" jsonb,
  	"version_auth_create_account" jsonb,
  	"version_auth_create_account_consent_label" jsonb,
  	"version_navigation" jsonb,
  	"version_general" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "wm_app_status" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "wm_app_status_locales" (
  	"baseline_country" "enum_wm_app_status_baseline_country" DEFAULT 'GB' NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "wm_app_status_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"app_cards_id" integer
  );
  
  CREATE TABLE "sy_atlas_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"default_map_center_latitude" numeric DEFAULT 0 NOT NULL,
  	"default_map_center_longitude" numeric DEFAULT 0 NOT NULL,
  	"default_zoom_level" numeric DEFAULT 10,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "sy_atlas_translations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_status" "enum_sy_atlas_translations_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "sy_atlas_translations_locales" (
  	"common" jsonb,
  	"map" jsonb,
  	"location" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_sy_atlas_translations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version__status" "enum__sy_atlas_translations_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__sy_atlas_translations_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_sy_atlas_translations_v_locales" (
  	"version_common" jsonb,
  	"version_map" jsonb,
  	"version_location" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "pages_tags" ADD CONSTRAINT "pages_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_featured_video_id_videos_id_fk" FOREIGN KEY ("featured_video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_meta_image_id_images_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_tags" ADD CONSTRAINT "_pages_v_version_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_author_id_authors_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_featured_video_id_videos_id_fk" FOREIGN KEY ("version_featured_video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_version_meta_image_id_images_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "meditations" ADD CONSTRAINT "meditations_narrator_id_narrators_id_fk" FOREIGN KEY ("narrator_id") REFERENCES "public"."narrators"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "meditations" ADD CONSTRAINT "meditations_song_tag_id_song_tags_id_fk" FOREIGN KEY ("song_tag_id") REFERENCES "public"."song_tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "meditations" ADD CONSTRAINT "meditations_thumbnail_id_images_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_parent_id_meditations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_version_narrator_id_narrators_id_fk" FOREIGN KEY ("version_narrator_id") REFERENCES "public"."narrators"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_version_song_tag_id_song_tags_id_fk" FOREIGN KEY ("version_song_tag_id") REFERENCES "public"."song_tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_version_thumbnail_id_images_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "songs" ADD CONSTRAINT "songs_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "songs_locales" ADD CONSTRAINT "songs_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "songs_rels" ADD CONSTRAINT "songs_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "songs_rels" ADD CONSTRAINT "songs_rels_song_tags_fk" FOREIGN KEY ("song_tags_id") REFERENCES "public"."song_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "albums" ADD CONSTRAINT "albums_artwork_id_images_id_fk" FOREIGN KEY ("artwork_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "albums_locales" ADD CONSTRAINT "albums_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "videos" ADD CONSTRAINT "videos_thumbnail_id_images_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "videos_locales" ADD CONSTRAINT "videos_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_panels" ADD CONSTRAINT "lessons_panels_media_id_files_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons_panels" ADD CONSTRAINT "lessons_panels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_intro_audio_id_files_id_fk" FOREIGN KEY ("intro_audio_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_icon_id_images_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons_locales" ADD CONSTRAINT "lessons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_meditations_fk" FOREIGN KEY ("meditations_id") REFERENCES "public"."meditations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_lectures_fk" FOREIGN KEY ("lectures_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lectures_subtitles" ADD CONSTRAINT "lectures_subtitles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lectures" ADD CONSTRAINT "lectures_thumbnail_id_images_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lectures" ADD CONSTRAINT "lectures_full_lecture_id_lectures_id_fk" FOREIGN KEY ("full_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lectures_locales" ADD CONSTRAINT "lectures_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lectures_rels" ADD CONSTRAINT "lectures_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lectures_rels" ADD CONSTRAINT "lectures_rels_audiences_fk" FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lectures_rels" ADD CONSTRAINT "lectures_rels_user_choices_fk" FOREIGN KEY ("user_choices_id") REFERENCES "public"."user_choices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lectures_rels" ADD CONSTRAINT "lectures_rels_subtle_system_nodes_fk" FOREIGN KEY ("subtle_system_nodes_id") REFERENCES "public"."subtle_system_nodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "frames_tags" ADD CONSTRAINT "frames_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."frames"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "frames" ADD CONSTRAINT "frames_subtle_system_node_id_subtle_system_nodes_id_fk" FOREIGN KEY ("subtle_system_node_id") REFERENCES "public"."subtle_system_nodes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors" ADD CONSTRAINT "authors_photo_id_images_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "authors_locales" ADD CONSTRAINT "authors_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "images_tags" ADD CONSTRAINT "images_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "images_locales" ADD CONSTRAINT "images_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "audiences_location_countries" ADD CONSTRAINT "audiences_location_countries_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_choices_timings" ADD CONSTRAINT "user_choices_timings_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user_choices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_choices" ADD CONSTRAINT "user_choices_parent_id_user_choices_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user_choices"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_choices_locales" ADD CONSTRAINT "user_choices_locales_morning_meditation_id_meditations_id_fk" FOREIGN KEY ("morning_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_choices_locales" ADD CONSTRAINT "user_choices_locales_afternoon_meditation_id_meditations_id_fk" FOREIGN KEY ("afternoon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_choices_locales" ADD CONSTRAINT "user_choices_locales_evening_meditation_id_meditations_id_fk" FOREIGN KEY ("evening_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_choices_locales" ADD CONSTRAINT "user_choices_locales_night_meditation_id_meditations_id_fk" FOREIGN KEY ("night_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_choices_locales" ADD CONSTRAINT "user_choices_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."user_choices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "subtle_system_nodes" ADD CONSTRAINT "subtle_system_nodes_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "song_tags_locales" ADD CONSTRAINT "song_tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."song_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "managers_roles" ADD CONSTRAINT "managers_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "managers_sessions" ADD CONSTRAINT "managers_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "managers_rels" ADD CONSTRAINT "managers_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "managers_rels" ADD CONSTRAINT "managers_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "clients_roles" ADD CONSTRAINT "clients_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_primary_contact_id_managers_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clients_rels" ADD CONSTRAINT "clients_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "clients_rels" ADD CONSTRAINT "clients_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_cards_schedule_weekdays" ADD CONSTRAINT "app_cards_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_cards_schedule_exclusions" ADD CONSTRAINT "app_cards_schedule_exclusions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_cards_target_sections" ADD CONSTRAINT "app_cards_target_sections_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_cards_timings" ADD CONSTRAINT "app_cards_timings_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_button_icon_id_images_id_fk" FOREIGN KEY ("default_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_page_id_pages_id_fk" FOREIGN KEY ("default_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_lecture_id_lectures_id_fk" FOREIGN KEY ("default_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_album_id_albums_id_fk" FOREIGN KEY ("default_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_meditation_id_meditations_id_fk" FOREIGN KEY ("default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_image_id_images_id_fk" FOREIGN KEY ("default_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_button_icon_id_images_id_fk" FOREIGN KEY ("starting_soon_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_page_id_pages_id_fk" FOREIGN KEY ("starting_soon_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_lecture_id_lectures_id_fk" FOREIGN KEY ("starting_soon_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_album_id_albums_id_fk" FOREIGN KEY ("starting_soon_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_image_id_images_id_fk" FOREIGN KEY ("starting_soon_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_button_icon_id_images_id_fk" FOREIGN KEY ("live_now_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_page_id_pages_id_fk" FOREIGN KEY ("live_now_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_lecture_id_lectures_id_fk" FOREIGN KEY ("live_now_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_album_id_albums_id_fk" FOREIGN KEY ("live_now_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_image_id_images_id_fk" FOREIGN KEY ("live_now_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards_locales" ADD CONSTRAINT "app_cards_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_cards_rels" ADD CONSTRAINT "app_cards_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "app_cards_rels" ADD CONSTRAINT "app_cards_rels_audiences_fk" FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_version_schedule_weekdays" ADD CONSTRAINT "_app_cards_v_version_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_version_schedule_exclusions" ADD CONSTRAINT "_app_cards_v_version_schedule_exclusions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_version_target_sections" ADD CONSTRAINT "_app_cards_v_version_target_sections_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_version_timings" ADD CONSTRAINT "_app_cards_v_version_timings_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_parent_id_app_cards_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."app_cards"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_button_icon_id_images_id_fk" FOREIGN KEY ("version_default_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_page_id_pages_id_fk" FOREIGN KEY ("version_default_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_lecture_id_lectures_id_fk" FOREIGN KEY ("version_default_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_album_id_albums_id_fk" FOREIGN KEY ("version_default_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_meditation_id_meditations_id_fk" FOREIGN KEY ("version_default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_image_id_images_id_fk" FOREIGN KEY ("version_default_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_button_icon_id_images_id_fk" FOREIGN KEY ("version_starting_soon_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_page_id_pages_id_fk" FOREIGN KEY ("version_starting_soon_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_lecture_id_lectures_id_fk" FOREIGN KEY ("version_starting_soon_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_album_id_albums_id_fk" FOREIGN KEY ("version_starting_soon_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("version_starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_image_id_images_id_fk" FOREIGN KEY ("version_starting_soon_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_button_icon_id_images_id_fk" FOREIGN KEY ("version_live_now_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_page_id_pages_id_fk" FOREIGN KEY ("version_live_now_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_lecture_id_lectures_id_fk" FOREIGN KEY ("version_live_now_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_album_id_albums_id_fk" FOREIGN KEY ("version_live_now_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("version_live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_image_id_images_id_fk" FOREIGN KEY ("version_live_now_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_rels" ADD CONSTRAINT "_app_cards_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_rels" ADD CONSTRAINT "_app_cards_v_rels_audiences_fk" FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_checkbox" ADD CONSTRAINT "forms_blocks_checkbox_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_checkbox_locales" ADD CONSTRAINT "forms_blocks_checkbox_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_checkbox"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_country" ADD CONSTRAINT "forms_blocks_country_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_country_locales" ADD CONSTRAINT "forms_blocks_country_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_country"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_email" ADD CONSTRAINT "forms_blocks_email_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_email_locales" ADD CONSTRAINT "forms_blocks_email_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_email"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_message" ADD CONSTRAINT "forms_blocks_message_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_message_locales" ADD CONSTRAINT "forms_blocks_message_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_message"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_number" ADD CONSTRAINT "forms_blocks_number_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_number_locales" ADD CONSTRAINT "forms_blocks_number_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_number"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_select_options" ADD CONSTRAINT "forms_blocks_select_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_select"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_select_options_locales" ADD CONSTRAINT "forms_blocks_select_options_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_select_options"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_select" ADD CONSTRAINT "forms_blocks_select_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_select_locales" ADD CONSTRAINT "forms_blocks_select_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_select"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_state" ADD CONSTRAINT "forms_blocks_state_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_state_locales" ADD CONSTRAINT "forms_blocks_state_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_state"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_text" ADD CONSTRAINT "forms_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_text_locales" ADD CONSTRAINT "forms_blocks_text_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_textarea" ADD CONSTRAINT "forms_blocks_textarea_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_blocks_textarea_locales" ADD CONSTRAINT "forms_blocks_textarea_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_blocks_textarea"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_emails" ADD CONSTRAINT "forms_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_emails_locales" ADD CONSTRAINT "forms_emails_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms_emails"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "forms_locales" ADD CONSTRAINT "forms_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "form_submissions_submission_data" ADD CONSTRAINT "form_submissions_submission_data_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meditations_fk" FOREIGN KEY ("meditations_id") REFERENCES "public"."meditations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_songs_fk" FOREIGN KEY ("songs_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_albums_fk" FOREIGN KEY ("albums_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_videos_fk" FOREIGN KEY ("videos_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lectures_fk" FOREIGN KEY ("lectures_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_frames_fk" FOREIGN KEY ("frames_id") REFERENCES "public"."frames"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_narrators_fk" FOREIGN KEY ("narrators_id") REFERENCES "public"."narrators"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_authors_fk" FOREIGN KEY ("authors_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_images_fk" FOREIGN KEY ("images_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_files_fk" FOREIGN KEY ("files_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audiences_fk" FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_choices_fk" FOREIGN KEY ("user_choices_id") REFERENCES "public"."user_choices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subtle_system_nodes_fk" FOREIGN KEY ("subtle_system_nodes_id") REFERENCES "public"."subtle_system_nodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_song_tags_fk" FOREIGN KEY ("song_tags_id") REFERENCES "public"."song_tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clients_fk" FOREIGN KEY ("clients_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_app_cards_fk" FOREIGN KEY ("app_cards_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forms_fk" FOREIGN KEY ("forms_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_form_submissions_fk" FOREIGN KEY ("form_submissions_id") REFERENCES "public"."form_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_clients_fk" FOREIGN KEY ("clients_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_config" ADD CONSTRAINT "wm_web_config_home_page_id_pages_id_fk" FOREIGN KEY ("home_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_web_config_rels" ADD CONSTRAINT "wm_web_config_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_web_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_config_rels" ADD CONSTRAINT "wm_web_config_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_translations_locales" ADD CONSTRAINT "wm_web_translations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wm_web_translations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wm_web_translations_v_locales" ADD CONSTRAINT "_wm_web_translations_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wm_web_translations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_config_vibe_check_tracks" ADD CONSTRAINT "wm_app_config_vibe_check_tracks_audio_id_files_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config_vibe_check_tracks" ADD CONSTRAINT "wm_app_config_vibe_check_tracks_subtitles_id_files_id_fk" FOREIGN KEY ("subtitles_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config_vibe_check_tracks" ADD CONSTRAINT "wm_app_config_vibe_check_tracks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wm_app_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_classes_page_id_pages_id_fk" FOREIGN KEY ("classes_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_live_meditations_page_id_pages_id_fk" FOREIGN KEY ("live_meditations_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_explore_page_id_pages_id_fk" FOREIGN KEY ("explore_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_explore_deeper_page_id_pages_id_fk" FOREIGN KEY ("explore_deeper_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_meditate_together_page_id_pages_id_fk" FOREIGN KEY ("meditate_together_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_techniques_page_id_pages_id_fk" FOREIGN KEY ("techniques_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_lectures_page_id_pages_id_fk" FOREIGN KEY ("lectures_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_lessons_page_id_pages_id_fk" FOREIGN KEY ("lessons_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_music_page_id_pages_id_fk" FOREIGN KEY ("music_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_shri_mataji_page_id_pages_id_fk" FOREIGN KEY ("shri_mataji_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_sahaja_yoga_page_id_pages_id_fk" FOREIGN KEY ("sahaja_yoga_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_subtle_system_page_id_pages_id_fk" FOREIGN KEY ("subtle_system_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_privacy_page_id_pages_id_fk" FOREIGN KEY ("privacy_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_terms_page_id_pages_id_fk" FOREIGN KEY ("terms_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config" ADD CONSTRAINT "wm_app_config_fallback_lecture_id_lectures_id_fk" FOREIGN KEY ("fallback_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config_locales" ADD CONSTRAINT "wm_app_config_locales_self_realization_meditation_id_meditations_id_fk" FOREIGN KEY ("self_realization_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config_locales" ADD CONSTRAINT "wm_app_config_locales_post_realization_lecture_id_lectures_id_fk" FOREIGN KEY ("post_realization_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_app_config_locales" ADD CONSTRAINT "wm_app_config_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wm_app_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_translations_locales" ADD CONSTRAINT "wm_app_translations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wm_app_translations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wm_app_translations_v_locales" ADD CONSTRAINT "_wm_app_translations_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wm_app_translations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_status_locales" ADD CONSTRAINT "wm_app_status_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wm_app_status"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_status_rels" ADD CONSTRAINT "wm_app_status_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_app_status"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_status_rels" ADD CONSTRAINT "wm_app_status_rels_app_cards_fk" FOREIGN KEY ("app_cards_id") REFERENCES "public"."app_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sy_atlas_translations_locales" ADD CONSTRAINT "sy_atlas_translations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sy_atlas_translations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD CONSTRAINT "_sy_atlas_translations_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_sy_atlas_translations_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_tags_order_idx" ON "pages_tags" USING btree ("order");
  CREATE INDEX "pages_tags_parent_idx" ON "pages_tags" USING btree ("parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_author_idx" ON "pages" USING btree ("author_id");
  CREATE INDEX "pages_featured_video_idx" ON "pages" USING btree ("featured_video_id");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages_deleted_at_idx" ON "pages" USING btree ("deleted_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "pages_meta_meta_image_idx" ON "pages_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_version_tags_order_idx" ON "_pages_v_version_tags" USING btree ("order");
  CREATE INDEX "_pages_v_version_tags_parent_idx" ON "_pages_v_version_tags" USING btree ("parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_author_idx" ON "_pages_v" USING btree ("version_author_id");
  CREATE INDEX "_pages_v_version_version_featured_video_idx" ON "_pages_v" USING btree ("version_featured_video_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "_pages_v" USING btree ("version_deleted_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX "_pages_v_version_meta_version_meta_image_idx" ON "_pages_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "meditations_narrator_idx" ON "meditations" USING btree ("narrator_id");
  CREATE INDEX "meditations_song_tag_idx" ON "meditations" USING btree ("song_tag_id");
  CREATE INDEX "meditations_thumbnail_idx" ON "meditations" USING btree ("thumbnail_id");
  CREATE INDEX "meditations_updated_at_idx" ON "meditations" USING btree ("updated_at");
  CREATE INDEX "meditations_created_at_idx" ON "meditations" USING btree ("created_at");
  CREATE INDEX "meditations_deleted_at_idx" ON "meditations" USING btree ("deleted_at");
  CREATE INDEX "meditations__status_idx" ON "meditations" USING btree ("_status");
  CREATE UNIQUE INDEX "meditations_filename_idx" ON "meditations" USING btree ("filename");
  CREATE INDEX "_meditations_v_parent_idx" ON "_meditations_v" USING btree ("parent_id");
  CREATE INDEX "_meditations_v_version_version_narrator_idx" ON "_meditations_v" USING btree ("version_narrator_id");
  CREATE INDEX "_meditations_v_version_version_song_tag_idx" ON "_meditations_v" USING btree ("version_song_tag_id");
  CREATE INDEX "_meditations_v_version_version_thumbnail_idx" ON "_meditations_v" USING btree ("version_thumbnail_id");
  CREATE INDEX "_meditations_v_version_version_updated_at_idx" ON "_meditations_v" USING btree ("version_updated_at");
  CREATE INDEX "_meditations_v_version_version_created_at_idx" ON "_meditations_v" USING btree ("version_created_at");
  CREATE INDEX "_meditations_v_version_version_deleted_at_idx" ON "_meditations_v" USING btree ("version_deleted_at");
  CREATE INDEX "_meditations_v_version_version__status_idx" ON "_meditations_v" USING btree ("version__status");
  CREATE INDEX "_meditations_v_version_version_filename_idx" ON "_meditations_v" USING btree ("version_filename");
  CREATE INDEX "_meditations_v_created_at_idx" ON "_meditations_v" USING btree ("created_at");
  CREATE INDEX "_meditations_v_updated_at_idx" ON "_meditations_v" USING btree ("updated_at");
  CREATE INDEX "_meditations_v_snapshot_idx" ON "_meditations_v" USING btree ("snapshot");
  CREATE INDEX "_meditations_v_published_locale_idx" ON "_meditations_v" USING btree ("published_locale");
  CREATE INDEX "_meditations_v_latest_idx" ON "_meditations_v" USING btree ("latest");
  CREATE INDEX "songs_album_idx" ON "songs" USING btree ("album_id");
  CREATE INDEX "songs_updated_at_idx" ON "songs" USING btree ("updated_at");
  CREATE INDEX "songs_created_at_idx" ON "songs" USING btree ("created_at");
  CREATE INDEX "songs_deleted_at_idx" ON "songs" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "songs_filename_idx" ON "songs" USING btree ("filename");
  CREATE UNIQUE INDEX "songs_locales_locale_parent_id_unique" ON "songs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "songs_rels_order_idx" ON "songs_rels" USING btree ("order");
  CREATE INDEX "songs_rels_parent_idx" ON "songs_rels" USING btree ("parent_id");
  CREATE INDEX "songs_rels_path_idx" ON "songs_rels" USING btree ("path");
  CREATE INDEX "songs_rels_song_tags_id_idx" ON "songs_rels" USING btree ("song_tags_id");
  CREATE INDEX "albums_artwork_idx" ON "albums" USING btree ("artwork_id");
  CREATE INDEX "albums_updated_at_idx" ON "albums" USING btree ("updated_at");
  CREATE INDEX "albums_created_at_idx" ON "albums" USING btree ("created_at");
  CREATE INDEX "albums_deleted_at_idx" ON "albums" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "albums_locales_locale_parent_id_unique" ON "albums_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "videos_thumbnail_idx" ON "videos" USING btree ("thumbnail_id");
  CREATE INDEX "videos_updated_at_idx" ON "videos" USING btree ("updated_at");
  CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");
  CREATE UNIQUE INDEX "videos_filename_idx" ON "videos" USING btree ("filename");
  CREATE UNIQUE INDEX "videos_locales_locale_parent_id_unique" ON "videos_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "lessons_panels_order_idx" ON "lessons_panels" USING btree ("_order");
  CREATE INDEX "lessons_panels_parent_id_idx" ON "lessons_panels" USING btree ("_parent_id");
  CREATE INDEX "lessons_panels_media_idx" ON "lessons_panels" USING btree ("media_id");
  CREATE INDEX "lessons_intro_audio_idx" ON "lessons" USING btree ("intro_audio_id");
  CREATE INDEX "lessons_icon_idx" ON "lessons" USING btree ("icon_id");
  CREATE INDEX "lessons_updated_at_idx" ON "lessons" USING btree ("updated_at");
  CREATE INDEX "lessons_created_at_idx" ON "lessons" USING btree ("created_at");
  CREATE INDEX "lessons_deleted_at_idx" ON "lessons" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "lessons_locales_locale_parent_id_unique" ON "lessons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "lessons_rels_order_idx" ON "lessons_rels" USING btree ("order");
  CREATE INDEX "lessons_rels_parent_idx" ON "lessons_rels" USING btree ("parent_id");
  CREATE INDEX "lessons_rels_path_idx" ON "lessons_rels" USING btree ("path");
  CREATE INDEX "lessons_rels_locale_idx" ON "lessons_rels" USING btree ("locale");
  CREATE INDEX "lessons_rels_meditations_id_idx" ON "lessons_rels" USING btree ("meditations_id","locale");
  CREATE INDEX "lessons_rels_videos_id_idx" ON "lessons_rels" USING btree ("videos_id","locale");
  CREATE INDEX "lessons_rels_lectures_id_idx" ON "lessons_rels" USING btree ("lectures_id","locale");
  CREATE INDEX "lectures_subtitles_order_idx" ON "lectures_subtitles" USING btree ("_order");
  CREATE INDEX "lectures_subtitles_parent_id_idx" ON "lectures_subtitles" USING btree ("_parent_id");
  CREATE INDEX "lectures_nirmal_vidya_vimeo_url_idx" ON "lectures" USING btree ("nirmal_vidya_vimeo_url");
  CREATE INDEX "lectures_thumbnail_idx" ON "lectures" USING btree ("thumbnail_id");
  CREATE INDEX "lectures_full_lecture_idx" ON "lectures" USING btree ("full_lecture_id");
  CREATE INDEX "lectures_updated_at_idx" ON "lectures" USING btree ("updated_at");
  CREATE INDEX "lectures_created_at_idx" ON "lectures" USING btree ("created_at");
  CREATE UNIQUE INDEX "lectures_locales_locale_parent_id_unique" ON "lectures_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "lectures_rels_order_idx" ON "lectures_rels" USING btree ("order");
  CREATE INDEX "lectures_rels_parent_idx" ON "lectures_rels" USING btree ("parent_id");
  CREATE INDEX "lectures_rels_path_idx" ON "lectures_rels" USING btree ("path");
  CREATE INDEX "lectures_rels_audiences_id_idx" ON "lectures_rels" USING btree ("audiences_id");
  CREATE INDEX "lectures_rels_user_choices_id_idx" ON "lectures_rels" USING btree ("user_choices_id");
  CREATE INDEX "lectures_rels_subtle_system_nodes_id_idx" ON "lectures_rels" USING btree ("subtle_system_nodes_id");
  CREATE INDEX "frames_tags_order_idx" ON "frames_tags" USING btree ("order");
  CREATE INDEX "frames_tags_parent_idx" ON "frames_tags" USING btree ("parent_id");
  CREATE INDEX "frames_subtle_system_node_idx" ON "frames" USING btree ("subtle_system_node_id");
  CREATE INDEX "frames_updated_at_idx" ON "frames" USING btree ("updated_at");
  CREATE INDEX "frames_created_at_idx" ON "frames" USING btree ("created_at");
  CREATE UNIQUE INDEX "frames_filename_idx" ON "frames" USING btree ("filename");
  CREATE INDEX "imageSet_idx" ON "frames" USING btree ("image_set");
  CREATE INDEX "narrators_updated_at_idx" ON "narrators" USING btree ("updated_at");
  CREATE INDEX "narrators_created_at_idx" ON "narrators" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_slug_idx" ON "authors" USING btree ("slug");
  CREATE INDEX "authors_photo_idx" ON "authors" USING btree ("photo_id");
  CREATE INDEX "authors_updated_at_idx" ON "authors" USING btree ("updated_at");
  CREATE INDEX "authors_created_at_idx" ON "authors" USING btree ("created_at");
  CREATE UNIQUE INDEX "authors_locales_locale_parent_id_unique" ON "authors_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "images_tags_order_idx" ON "images_tags" USING btree ("order");
  CREATE INDEX "images_tags_parent_idx" ON "images_tags" USING btree ("parent_id");
  CREATE INDEX "images_updated_at_idx" ON "images" USING btree ("updated_at");
  CREATE INDEX "images_created_at_idx" ON "images" USING btree ("created_at");
  CREATE INDEX "images_deleted_at_idx" ON "images" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "images_filename_idx" ON "images" USING btree ("filename");
  CREATE UNIQUE INDEX "images_locales_locale_parent_id_unique" ON "images_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "files_updated_at_idx" ON "files" USING btree ("updated_at");
  CREATE INDEX "files_deleted_at_idx" ON "files" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "files_filename_idx" ON "files" USING btree ("filename");
  CREATE INDEX "audiences_location_countries_order_idx" ON "audiences_location_countries" USING btree ("order");
  CREATE INDEX "audiences_location_countries_parent_idx" ON "audiences_location_countries" USING btree ("parent_id");
  CREATE INDEX "audiences_updated_at_idx" ON "audiences" USING btree ("updated_at");
  CREATE INDEX "audiences_created_at_idx" ON "audiences" USING btree ("created_at");
  CREATE INDEX "user_choices_timings_order_idx" ON "user_choices_timings" USING btree ("order");
  CREATE INDEX "user_choices_timings_parent_idx" ON "user_choices_timings" USING btree ("parent_id");
  CREATE UNIQUE INDEX "user_choices_slug_idx" ON "user_choices" USING btree ("slug");
  CREATE INDEX "user_choices_parent_idx" ON "user_choices" USING btree ("parent_id");
  CREATE INDEX "user_choices_is_parent_idx" ON "user_choices" USING btree ("is_parent");
  CREATE INDEX "user_choices_updated_at_idx" ON "user_choices" USING btree ("updated_at");
  CREATE INDEX "user_choices_created_at_idx" ON "user_choices" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_choices_filename_idx" ON "user_choices" USING btree ("filename");
  CREATE INDEX "user_choices_morning_meditation_idx" ON "user_choices_locales" USING btree ("morning_meditation_id","_locale");
  CREATE INDEX "user_choices_afternoon_meditation_idx" ON "user_choices_locales" USING btree ("afternoon_meditation_id","_locale");
  CREATE INDEX "user_choices_evening_meditation_idx" ON "user_choices_locales" USING btree ("evening_meditation_id","_locale");
  CREATE INDEX "user_choices_night_meditation_idx" ON "user_choices_locales" USING btree ("night_meditation_id","_locale");
  CREATE UNIQUE INDEX "user_choices_locales_locale_parent_id_unique" ON "user_choices_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "subtle_system_nodes_slug_idx" ON "subtle_system_nodes" USING btree ("slug");
  CREATE INDEX "subtle_system_nodes_page_idx" ON "subtle_system_nodes" USING btree ("page_id");
  CREATE INDEX "subtle_system_nodes_updated_at_idx" ON "subtle_system_nodes" USING btree ("updated_at");
  CREATE INDEX "subtle_system_nodes_created_at_idx" ON "subtle_system_nodes" USING btree ("created_at");
  CREATE UNIQUE INDEX "song_tags_slug_idx" ON "song_tags" USING btree ("slug");
  CREATE INDEX "song_tags_updated_at_idx" ON "song_tags" USING btree ("updated_at");
  CREATE INDEX "song_tags_created_at_idx" ON "song_tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "song_tags_filename_idx" ON "song_tags" USING btree ("filename");
  CREATE UNIQUE INDEX "song_tags_locales_locale_parent_id_unique" ON "song_tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "managers_roles_order_idx" ON "managers_roles" USING btree ("order");
  CREATE INDEX "managers_roles_parent_idx" ON "managers_roles" USING btree ("parent_id");
  CREATE INDEX "managers_roles_locale_idx" ON "managers_roles" USING btree ("locale");
  CREATE INDEX "managers_sessions_order_idx" ON "managers_sessions" USING btree ("_order");
  CREATE INDEX "managers_sessions_parent_id_idx" ON "managers_sessions" USING btree ("_parent_id");
  CREATE INDEX "managers_updated_at_idx" ON "managers" USING btree ("updated_at");
  CREATE INDEX "managers_created_at_idx" ON "managers" USING btree ("created_at");
  CREATE UNIQUE INDEX "managers_email_idx" ON "managers" USING btree ("email");
  CREATE INDEX "managers_rels_order_idx" ON "managers_rels" USING btree ("order");
  CREATE INDEX "managers_rels_parent_idx" ON "managers_rels" USING btree ("parent_id");
  CREATE INDEX "managers_rels_path_idx" ON "managers_rels" USING btree ("path");
  CREATE INDEX "managers_rels_pages_id_idx" ON "managers_rels" USING btree ("pages_id");
  CREATE INDEX "clients_roles_order_idx" ON "clients_roles" USING btree ("order");
  CREATE INDEX "clients_roles_parent_idx" ON "clients_roles" USING btree ("parent_id");
  CREATE INDEX "clients_primary_contact_idx" ON "clients" USING btree ("primary_contact_id");
  CREATE INDEX "clients_updated_at_idx" ON "clients" USING btree ("updated_at");
  CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");
  CREATE INDEX "active_idx" ON "clients" USING btree ("active");
  CREATE INDEX "clients_rels_order_idx" ON "clients_rels" USING btree ("order");
  CREATE INDEX "clients_rels_parent_idx" ON "clients_rels" USING btree ("parent_id");
  CREATE INDEX "clients_rels_path_idx" ON "clients_rels" USING btree ("path");
  CREATE INDEX "clients_rels_managers_id_idx" ON "clients_rels" USING btree ("managers_id");
  CREATE INDEX "app_cards_schedule_weekdays_order_idx" ON "app_cards_schedule_weekdays" USING btree ("order");
  CREATE INDEX "app_cards_schedule_weekdays_parent_idx" ON "app_cards_schedule_weekdays" USING btree ("parent_id");
  CREATE INDEX "app_cards_schedule_exclusions_order_idx" ON "app_cards_schedule_exclusions" USING btree ("_order");
  CREATE INDEX "app_cards_schedule_exclusions_parent_id_idx" ON "app_cards_schedule_exclusions" USING btree ("_parent_id");
  CREATE INDEX "app_cards_target_sections_order_idx" ON "app_cards_target_sections" USING btree ("order");
  CREATE INDEX "app_cards_target_sections_parent_idx" ON "app_cards_target_sections" USING btree ("parent_id");
  CREATE INDEX "app_cards_timings_order_idx" ON "app_cards_timings" USING btree ("order");
  CREATE INDEX "app_cards_timings_parent_idx" ON "app_cards_timings" USING btree ("parent_id");
  CREATE INDEX "app_cards_default_default_button_icon_idx" ON "app_cards" USING btree ("default_button_icon_id");
  CREATE INDEX "app_cards_default_default_page_idx" ON "app_cards" USING btree ("default_page_id");
  CREATE INDEX "app_cards_default_default_lecture_idx" ON "app_cards" USING btree ("default_lecture_id");
  CREATE INDEX "app_cards_default_default_album_idx" ON "app_cards" USING btree ("default_album_id");
  CREATE INDEX "app_cards_default_default_meditation_idx" ON "app_cards" USING btree ("default_meditation_id");
  CREATE INDEX "app_cards_default_default_image_idx" ON "app_cards" USING btree ("default_image_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_button_icon_idx" ON "app_cards" USING btree ("starting_soon_button_icon_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_page_idx" ON "app_cards" USING btree ("starting_soon_page_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_lecture_idx" ON "app_cards" USING btree ("starting_soon_lecture_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_album_idx" ON "app_cards" USING btree ("starting_soon_album_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_meditation_idx" ON "app_cards" USING btree ("starting_soon_meditation_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_image_idx" ON "app_cards" USING btree ("starting_soon_image_id");
  CREATE INDEX "app_cards_live_now_live_now_button_icon_idx" ON "app_cards" USING btree ("live_now_button_icon_id");
  CREATE INDEX "app_cards_live_now_live_now_page_idx" ON "app_cards" USING btree ("live_now_page_id");
  CREATE INDEX "app_cards_live_now_live_now_lecture_idx" ON "app_cards" USING btree ("live_now_lecture_id");
  CREATE INDEX "app_cards_live_now_live_now_album_idx" ON "app_cards" USING btree ("live_now_album_id");
  CREATE INDEX "app_cards_live_now_live_now_meditation_idx" ON "app_cards" USING btree ("live_now_meditation_id");
  CREATE INDEX "app_cards_live_now_live_now_image_idx" ON "app_cards" USING btree ("live_now_image_id");
  CREATE INDEX "app_cards_updated_at_idx" ON "app_cards" USING btree ("updated_at");
  CREATE INDEX "app_cards_created_at_idx" ON "app_cards" USING btree ("created_at");
  CREATE INDEX "app_cards__status_idx" ON "app_cards" USING btree ("_status");
  CREATE UNIQUE INDEX "app_cards_locales_locale_parent_id_unique" ON "app_cards_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "app_cards_rels_order_idx" ON "app_cards_rels" USING btree ("order");
  CREATE INDEX "app_cards_rels_parent_idx" ON "app_cards_rels" USING btree ("parent_id");
  CREATE INDEX "app_cards_rels_path_idx" ON "app_cards_rels" USING btree ("path");
  CREATE INDEX "app_cards_rels_audiences_id_idx" ON "app_cards_rels" USING btree ("audiences_id");
  CREATE INDEX "_app_cards_v_version_schedule_weekdays_order_idx" ON "_app_cards_v_version_schedule_weekdays" USING btree ("order");
  CREATE INDEX "_app_cards_v_version_schedule_weekdays_parent_idx" ON "_app_cards_v_version_schedule_weekdays" USING btree ("parent_id");
  CREATE INDEX "_app_cards_v_version_schedule_exclusions_order_idx" ON "_app_cards_v_version_schedule_exclusions" USING btree ("_order");
  CREATE INDEX "_app_cards_v_version_schedule_exclusions_parent_id_idx" ON "_app_cards_v_version_schedule_exclusions" USING btree ("_parent_id");
  CREATE INDEX "_app_cards_v_version_target_sections_order_idx" ON "_app_cards_v_version_target_sections" USING btree ("order");
  CREATE INDEX "_app_cards_v_version_target_sections_parent_idx" ON "_app_cards_v_version_target_sections" USING btree ("parent_id");
  CREATE INDEX "_app_cards_v_version_timings_order_idx" ON "_app_cards_v_version_timings" USING btree ("order");
  CREATE INDEX "_app_cards_v_version_timings_parent_idx" ON "_app_cards_v_version_timings" USING btree ("parent_id");
  CREATE INDEX "_app_cards_v_parent_idx" ON "_app_cards_v" USING btree ("parent_id");
  CREATE INDEX "_app_cards_v_version_default_version_default_button_icon_idx" ON "_app_cards_v" USING btree ("version_default_button_icon_id");
  CREATE INDEX "_app_cards_v_version_default_version_default_page_idx" ON "_app_cards_v" USING btree ("version_default_page_id");
  CREATE INDEX "_app_cards_v_version_default_version_default_lecture_idx" ON "_app_cards_v" USING btree ("version_default_lecture_id");
  CREATE INDEX "_app_cards_v_version_default_version_default_album_idx" ON "_app_cards_v" USING btree ("version_default_album_id");
  CREATE INDEX "_app_cards_v_version_default_version_default_meditation_idx" ON "_app_cards_v" USING btree ("version_default_meditation_id");
  CREATE INDEX "_app_cards_v_version_default_version_default_image_idx" ON "_app_cards_v" USING btree ("version_default_image_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_soon_idx" ON "_app_cards_v" USING btree ("version_starting_soon_button_icon_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_1_idx" ON "_app_cards_v" USING btree ("version_starting_soon_page_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_2_idx" ON "_app_cards_v" USING btree ("version_starting_soon_lecture_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_3_idx" ON "_app_cards_v" USING btree ("version_starting_soon_album_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_4_idx" ON "_app_cards_v" USING btree ("version_starting_soon_meditation_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_5_idx" ON "_app_cards_v" USING btree ("version_starting_soon_image_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_button_ic_idx" ON "_app_cards_v" USING btree ("version_live_now_button_icon_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_page_idx" ON "_app_cards_v" USING btree ("version_live_now_page_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_lecture_idx" ON "_app_cards_v" USING btree ("version_live_now_lecture_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_album_idx" ON "_app_cards_v" USING btree ("version_live_now_album_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_meditatio_idx" ON "_app_cards_v" USING btree ("version_live_now_meditation_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_image_idx" ON "_app_cards_v" USING btree ("version_live_now_image_id");
  CREATE INDEX "_app_cards_v_version_version_updated_at_idx" ON "_app_cards_v" USING btree ("version_updated_at");
  CREATE INDEX "_app_cards_v_version_version_created_at_idx" ON "_app_cards_v" USING btree ("version_created_at");
  CREATE INDEX "_app_cards_v_version_version__status_idx" ON "_app_cards_v" USING btree ("version__status");
  CREATE INDEX "_app_cards_v_created_at_idx" ON "_app_cards_v" USING btree ("created_at");
  CREATE INDEX "_app_cards_v_updated_at_idx" ON "_app_cards_v" USING btree ("updated_at");
  CREATE INDEX "_app_cards_v_snapshot_idx" ON "_app_cards_v" USING btree ("snapshot");
  CREATE INDEX "_app_cards_v_published_locale_idx" ON "_app_cards_v" USING btree ("published_locale");
  CREATE INDEX "_app_cards_v_latest_idx" ON "_app_cards_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_app_cards_v_locales_locale_parent_id_unique" ON "_app_cards_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_app_cards_v_rels_order_idx" ON "_app_cards_v_rels" USING btree ("order");
  CREATE INDEX "_app_cards_v_rels_parent_idx" ON "_app_cards_v_rels" USING btree ("parent_id");
  CREATE INDEX "_app_cards_v_rels_path_idx" ON "_app_cards_v_rels" USING btree ("path");
  CREATE INDEX "_app_cards_v_rels_audiences_id_idx" ON "_app_cards_v_rels" USING btree ("audiences_id");
  CREATE INDEX "forms_blocks_checkbox_order_idx" ON "forms_blocks_checkbox" USING btree ("_order");
  CREATE INDEX "forms_blocks_checkbox_parent_id_idx" ON "forms_blocks_checkbox" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_checkbox_path_idx" ON "forms_blocks_checkbox" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_checkbox_locales_locale_parent_id_unique" ON "forms_blocks_checkbox_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_country_order_idx" ON "forms_blocks_country" USING btree ("_order");
  CREATE INDEX "forms_blocks_country_parent_id_idx" ON "forms_blocks_country" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_country_path_idx" ON "forms_blocks_country" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_country_locales_locale_parent_id_unique" ON "forms_blocks_country_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_email_order_idx" ON "forms_blocks_email" USING btree ("_order");
  CREATE INDEX "forms_blocks_email_parent_id_idx" ON "forms_blocks_email" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_email_path_idx" ON "forms_blocks_email" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_email_locales_locale_parent_id_unique" ON "forms_blocks_email_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_message_order_idx" ON "forms_blocks_message" USING btree ("_order");
  CREATE INDEX "forms_blocks_message_parent_id_idx" ON "forms_blocks_message" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_message_path_idx" ON "forms_blocks_message" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_message_locales_locale_parent_id_unique" ON "forms_blocks_message_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_number_order_idx" ON "forms_blocks_number" USING btree ("_order");
  CREATE INDEX "forms_blocks_number_parent_id_idx" ON "forms_blocks_number" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_number_path_idx" ON "forms_blocks_number" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_number_locales_locale_parent_id_unique" ON "forms_blocks_number_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_select_options_order_idx" ON "forms_blocks_select_options" USING btree ("_order");
  CREATE INDEX "forms_blocks_select_options_parent_id_idx" ON "forms_blocks_select_options" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "forms_blocks_select_options_locales_locale_parent_id_unique" ON "forms_blocks_select_options_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_select_order_idx" ON "forms_blocks_select" USING btree ("_order");
  CREATE INDEX "forms_blocks_select_parent_id_idx" ON "forms_blocks_select" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_select_path_idx" ON "forms_blocks_select" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_select_locales_locale_parent_id_unique" ON "forms_blocks_select_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_state_order_idx" ON "forms_blocks_state" USING btree ("_order");
  CREATE INDEX "forms_blocks_state_parent_id_idx" ON "forms_blocks_state" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_state_path_idx" ON "forms_blocks_state" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_state_locales_locale_parent_id_unique" ON "forms_blocks_state_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_text_order_idx" ON "forms_blocks_text" USING btree ("_order");
  CREATE INDEX "forms_blocks_text_parent_id_idx" ON "forms_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_text_path_idx" ON "forms_blocks_text" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_text_locales_locale_parent_id_unique" ON "forms_blocks_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_textarea_order_idx" ON "forms_blocks_textarea" USING btree ("_order");
  CREATE INDEX "forms_blocks_textarea_parent_id_idx" ON "forms_blocks_textarea" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_textarea_path_idx" ON "forms_blocks_textarea" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_textarea_locales_locale_parent_id_unique" ON "forms_blocks_textarea_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_emails_order_idx" ON "forms_emails" USING btree ("_order");
  CREATE INDEX "forms_emails_parent_id_idx" ON "forms_emails" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "forms_emails_locales_locale_parent_id_unique" ON "forms_emails_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_updated_at_idx" ON "forms" USING btree ("updated_at");
  CREATE INDEX "forms_created_at_idx" ON "forms" USING btree ("created_at");
  CREATE UNIQUE INDEX "forms_locales_locale_parent_id_unique" ON "forms_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "form_submissions_submission_data_order_idx" ON "form_submissions_submission_data" USING btree ("_order");
  CREATE INDEX "form_submissions_submission_data_parent_id_idx" ON "form_submissions_submission_data" USING btree ("_parent_id");
  CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id");
  CREATE INDEX "form_submissions_updated_at_idx" ON "form_submissions" USING btree ("updated_at");
  CREATE INDEX "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_jobs_log_order_idx" ON "payload_jobs_log" USING btree ("_order");
  CREATE INDEX "payload_jobs_log_parent_id_idx" ON "payload_jobs_log" USING btree ("_parent_id");
  CREATE INDEX "payload_jobs_completed_at_idx" ON "payload_jobs" USING btree ("completed_at");
  CREATE INDEX "payload_jobs_total_tried_idx" ON "payload_jobs" USING btree ("total_tried");
  CREATE INDEX "payload_jobs_has_error_idx" ON "payload_jobs" USING btree ("has_error");
  CREATE INDEX "payload_jobs_task_slug_idx" ON "payload_jobs" USING btree ("task_slug");
  CREATE INDEX "payload_jobs_queue_idx" ON "payload_jobs" USING btree ("queue");
  CREATE INDEX "payload_jobs_wait_until_idx" ON "payload_jobs" USING btree ("wait_until");
  CREATE INDEX "payload_jobs_processing_idx" ON "payload_jobs" USING btree ("processing");
  CREATE INDEX "payload_jobs_updated_at_idx" ON "payload_jobs" USING btree ("updated_at");
  CREATE INDEX "payload_jobs_created_at_idx" ON "payload_jobs" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");
  CREATE INDEX "payload_locked_documents_rels_meditations_id_idx" ON "payload_locked_documents_rels" USING btree ("meditations_id");
  CREATE INDEX "payload_locked_documents_rels_songs_id_idx" ON "payload_locked_documents_rels" USING btree ("songs_id");
  CREATE INDEX "payload_locked_documents_rels_albums_id_idx" ON "payload_locked_documents_rels" USING btree ("albums_id");
  CREATE INDEX "payload_locked_documents_rels_videos_id_idx" ON "payload_locked_documents_rels" USING btree ("videos_id");
  CREATE INDEX "payload_locked_documents_rels_lessons_id_idx" ON "payload_locked_documents_rels" USING btree ("lessons_id");
  CREATE INDEX "payload_locked_documents_rels_lectures_id_idx" ON "payload_locked_documents_rels" USING btree ("lectures_id");
  CREATE INDEX "payload_locked_documents_rels_frames_id_idx" ON "payload_locked_documents_rels" USING btree ("frames_id");
  CREATE INDEX "payload_locked_documents_rels_narrators_id_idx" ON "payload_locked_documents_rels" USING btree ("narrators_id");
  CREATE INDEX "payload_locked_documents_rels_authors_id_idx" ON "payload_locked_documents_rels" USING btree ("authors_id");
  CREATE INDEX "payload_locked_documents_rels_images_id_idx" ON "payload_locked_documents_rels" USING btree ("images_id");
  CREATE INDEX "payload_locked_documents_rels_files_id_idx" ON "payload_locked_documents_rels" USING btree ("files_id");
  CREATE INDEX "payload_locked_documents_rels_audiences_id_idx" ON "payload_locked_documents_rels" USING btree ("audiences_id");
  CREATE INDEX "payload_locked_documents_rels_user_choices_id_idx" ON "payload_locked_documents_rels" USING btree ("user_choices_id");
  CREATE INDEX "payload_locked_documents_rels_subtle_system_nodes_id_idx" ON "payload_locked_documents_rels" USING btree ("subtle_system_nodes_id");
  CREATE INDEX "payload_locked_documents_rels_song_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("song_tags_id");
  CREATE INDEX "payload_locked_documents_rels_managers_id_idx" ON "payload_locked_documents_rels" USING btree ("managers_id");
  CREATE INDEX "payload_locked_documents_rels_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("clients_id");
  CREATE INDEX "payload_locked_documents_rels_app_cards_id_idx" ON "payload_locked_documents_rels" USING btree ("app_cards_id");
  CREATE INDEX "payload_locked_documents_rels_forms_id_idx" ON "payload_locked_documents_rels" USING btree ("forms_id");
  CREATE INDEX "payload_locked_documents_rels_form_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("form_submissions_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_managers_id_idx" ON "payload_preferences_rels" USING btree ("managers_id");
  CREATE INDEX "payload_preferences_rels_clients_id_idx" ON "payload_preferences_rels" USING btree ("clients_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "wm_web_config_home_page_idx" ON "wm_web_config" USING btree ("home_page_id");
  CREATE INDEX "wm_web_config_rels_order_idx" ON "wm_web_config_rels" USING btree ("order");
  CREATE INDEX "wm_web_config_rels_parent_idx" ON "wm_web_config_rels" USING btree ("parent_id");
  CREATE INDEX "wm_web_config_rels_path_idx" ON "wm_web_config_rels" USING btree ("path");
  CREATE INDEX "wm_web_config_rels_pages_id_idx" ON "wm_web_config_rels" USING btree ("pages_id");
  CREATE INDEX "wm_web_translations__status_idx" ON "wm_web_translations" USING btree ("_status");
  CREATE UNIQUE INDEX "wm_web_translations_locales_locale_parent_id_unique" ON "wm_web_translations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_wm_web_translations_v_version_version__status_idx" ON "_wm_web_translations_v" USING btree ("version__status");
  CREATE INDEX "_wm_web_translations_v_created_at_idx" ON "_wm_web_translations_v" USING btree ("created_at");
  CREATE INDEX "_wm_web_translations_v_updated_at_idx" ON "_wm_web_translations_v" USING btree ("updated_at");
  CREATE INDEX "_wm_web_translations_v_snapshot_idx" ON "_wm_web_translations_v" USING btree ("snapshot");
  CREATE INDEX "_wm_web_translations_v_published_locale_idx" ON "_wm_web_translations_v" USING btree ("published_locale");
  CREATE INDEX "_wm_web_translations_v_latest_idx" ON "_wm_web_translations_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_wm_web_translations_v_locales_locale_parent_id_unique" ON "_wm_web_translations_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wm_app_config_vibe_check_tracks_order_idx" ON "wm_app_config_vibe_check_tracks" USING btree ("_order");
  CREATE INDEX "wm_app_config_vibe_check_tracks_parent_id_idx" ON "wm_app_config_vibe_check_tracks" USING btree ("_parent_id");
  CREATE INDEX "wm_app_config_vibe_check_tracks_locale_idx" ON "wm_app_config_vibe_check_tracks" USING btree ("_locale");
  CREATE INDEX "wm_app_config_vibe_check_tracks_audio_idx" ON "wm_app_config_vibe_check_tracks" USING btree ("audio_id");
  CREATE INDEX "wm_app_config_vibe_check_tracks_subtitles_idx" ON "wm_app_config_vibe_check_tracks" USING btree ("subtitles_id");
  CREATE INDEX "wm_app_config_classes_page_idx" ON "wm_app_config" USING btree ("classes_page_id");
  CREATE INDEX "wm_app_config_live_meditations_page_idx" ON "wm_app_config" USING btree ("live_meditations_page_id");
  CREATE INDEX "wm_app_config_explore_page_idx" ON "wm_app_config" USING btree ("explore_page_id");
  CREATE INDEX "wm_app_config_explore_deeper_page_idx" ON "wm_app_config" USING btree ("explore_deeper_page_id");
  CREATE INDEX "wm_app_config_meditate_together_page_idx" ON "wm_app_config" USING btree ("meditate_together_page_id");
  CREATE INDEX "wm_app_config_techniques_page_idx" ON "wm_app_config" USING btree ("techniques_page_id");
  CREATE INDEX "wm_app_config_lectures_page_idx" ON "wm_app_config" USING btree ("lectures_page_id");
  CREATE INDEX "wm_app_config_lessons_page_idx" ON "wm_app_config" USING btree ("lessons_page_id");
  CREATE INDEX "wm_app_config_music_page_idx" ON "wm_app_config" USING btree ("music_page_id");
  CREATE INDEX "wm_app_config_shri_mataji_page_idx" ON "wm_app_config" USING btree ("shri_mataji_page_id");
  CREATE INDEX "wm_app_config_sahaja_yoga_page_idx" ON "wm_app_config" USING btree ("sahaja_yoga_page_id");
  CREATE INDEX "wm_app_config_subtle_system_page_idx" ON "wm_app_config" USING btree ("subtle_system_page_id");
  CREATE INDEX "wm_app_config_privacy_page_idx" ON "wm_app_config" USING btree ("privacy_page_id");
  CREATE INDEX "wm_app_config_terms_page_idx" ON "wm_app_config" USING btree ("terms_page_id");
  CREATE INDEX "wm_app_config_fallback_lecture_idx" ON "wm_app_config" USING btree ("fallback_lecture_id");
  CREATE INDEX "wm_app_config_self_realization_meditation_idx" ON "wm_app_config_locales" USING btree ("self_realization_meditation_id","_locale");
  CREATE INDEX "wm_app_config_post_realization_lecture_idx" ON "wm_app_config_locales" USING btree ("post_realization_lecture_id","_locale");
  CREATE UNIQUE INDEX "wm_app_config_locales_locale_parent_id_unique" ON "wm_app_config_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wm_app_translations__status_idx" ON "wm_app_translations" USING btree ("_status");
  CREATE UNIQUE INDEX "wm_app_translations_locales_locale_parent_id_unique" ON "wm_app_translations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_wm_app_translations_v_version_version__status_idx" ON "_wm_app_translations_v" USING btree ("version__status");
  CREATE INDEX "_wm_app_translations_v_created_at_idx" ON "_wm_app_translations_v" USING btree ("created_at");
  CREATE INDEX "_wm_app_translations_v_updated_at_idx" ON "_wm_app_translations_v" USING btree ("updated_at");
  CREATE INDEX "_wm_app_translations_v_snapshot_idx" ON "_wm_app_translations_v" USING btree ("snapshot");
  CREATE INDEX "_wm_app_translations_v_published_locale_idx" ON "_wm_app_translations_v" USING btree ("published_locale");
  CREATE INDEX "_wm_app_translations_v_latest_idx" ON "_wm_app_translations_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_wm_app_translations_v_locales_locale_parent_id_unique" ON "_wm_app_translations_v_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "wm_app_status_locales_locale_parent_id_unique" ON "wm_app_status_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wm_app_status_rels_order_idx" ON "wm_app_status_rels" USING btree ("order");
  CREATE INDEX "wm_app_status_rels_parent_idx" ON "wm_app_status_rels" USING btree ("parent_id");
  CREATE INDEX "wm_app_status_rels_path_idx" ON "wm_app_status_rels" USING btree ("path");
  CREATE INDEX "wm_app_status_rels_app_cards_id_idx" ON "wm_app_status_rels" USING btree ("app_cards_id");
  CREATE INDEX "sy_atlas_translations__status_idx" ON "sy_atlas_translations" USING btree ("_status");
  CREATE UNIQUE INDEX "sy_atlas_translations_locales_locale_parent_id_unique" ON "sy_atlas_translations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_sy_atlas_translations_v_version_version__status_idx" ON "_sy_atlas_translations_v" USING btree ("version__status");
  CREATE INDEX "_sy_atlas_translations_v_created_at_idx" ON "_sy_atlas_translations_v" USING btree ("created_at");
  CREATE INDEX "_sy_atlas_translations_v_updated_at_idx" ON "_sy_atlas_translations_v" USING btree ("updated_at");
  CREATE INDEX "_sy_atlas_translations_v_snapshot_idx" ON "_sy_atlas_translations_v" USING btree ("snapshot");
  CREATE INDEX "_sy_atlas_translations_v_published_locale_idx" ON "_sy_atlas_translations_v" USING btree ("published_locale");
  CREATE INDEX "_sy_atlas_translations_v_latest_idx" ON "_sy_atlas_translations_v" USING btree ("latest");
  CREATE UNIQUE INDEX "_sy_atlas_translations_v_locales_locale_parent_id_unique" ON "_sy_atlas_translations_v_locales" USING btree ("_locale","_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_tags" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "_pages_v_version_tags" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_locales" CASCADE;
  DROP TABLE "meditations" CASCADE;
  DROP TABLE "_meditations_v" CASCADE;
  DROP TABLE "songs" CASCADE;
  DROP TABLE "songs_locales" CASCADE;
  DROP TABLE "songs_rels" CASCADE;
  DROP TABLE "albums" CASCADE;
  DROP TABLE "albums_locales" CASCADE;
  DROP TABLE "videos" CASCADE;
  DROP TABLE "videos_locales" CASCADE;
  DROP TABLE "lessons_panels" CASCADE;
  DROP TABLE "lessons" CASCADE;
  DROP TABLE "lessons_locales" CASCADE;
  DROP TABLE "lessons_rels" CASCADE;
  DROP TABLE "lectures_subtitles" CASCADE;
  DROP TABLE "lectures" CASCADE;
  DROP TABLE "lectures_locales" CASCADE;
  DROP TABLE "lectures_rels" CASCADE;
  DROP TABLE "frames_tags" CASCADE;
  DROP TABLE "frames" CASCADE;
  DROP TABLE "narrators" CASCADE;
  DROP TABLE "authors" CASCADE;
  DROP TABLE "authors_locales" CASCADE;
  DROP TABLE "images_tags" CASCADE;
  DROP TABLE "images" CASCADE;
  DROP TABLE "images_locales" CASCADE;
  DROP TABLE "files" CASCADE;
  DROP TABLE "audiences_location_countries" CASCADE;
  DROP TABLE "audiences" CASCADE;
  DROP TABLE "user_choices_timings" CASCADE;
  DROP TABLE "user_choices" CASCADE;
  DROP TABLE "user_choices_locales" CASCADE;
  DROP TABLE "subtle_system_nodes" CASCADE;
  DROP TABLE "song_tags" CASCADE;
  DROP TABLE "song_tags_locales" CASCADE;
  DROP TABLE "managers_roles" CASCADE;
  DROP TABLE "managers_sessions" CASCADE;
  DROP TABLE "managers" CASCADE;
  DROP TABLE "managers_rels" CASCADE;
  DROP TABLE "clients_roles" CASCADE;
  DROP TABLE "clients" CASCADE;
  DROP TABLE "clients_rels" CASCADE;
  DROP TABLE "app_cards_schedule_weekdays" CASCADE;
  DROP TABLE "app_cards_schedule_exclusions" CASCADE;
  DROP TABLE "app_cards_target_sections" CASCADE;
  DROP TABLE "app_cards_timings" CASCADE;
  DROP TABLE "app_cards" CASCADE;
  DROP TABLE "app_cards_locales" CASCADE;
  DROP TABLE "app_cards_rels" CASCADE;
  DROP TABLE "_app_cards_v_version_schedule_weekdays" CASCADE;
  DROP TABLE "_app_cards_v_version_schedule_exclusions" CASCADE;
  DROP TABLE "_app_cards_v_version_target_sections" CASCADE;
  DROP TABLE "_app_cards_v_version_timings" CASCADE;
  DROP TABLE "_app_cards_v" CASCADE;
  DROP TABLE "_app_cards_v_locales" CASCADE;
  DROP TABLE "_app_cards_v_rels" CASCADE;
  DROP TABLE "forms_blocks_checkbox" CASCADE;
  DROP TABLE "forms_blocks_checkbox_locales" CASCADE;
  DROP TABLE "forms_blocks_country" CASCADE;
  DROP TABLE "forms_blocks_country_locales" CASCADE;
  DROP TABLE "forms_blocks_email" CASCADE;
  DROP TABLE "forms_blocks_email_locales" CASCADE;
  DROP TABLE "forms_blocks_message" CASCADE;
  DROP TABLE "forms_blocks_message_locales" CASCADE;
  DROP TABLE "forms_blocks_number" CASCADE;
  DROP TABLE "forms_blocks_number_locales" CASCADE;
  DROP TABLE "forms_blocks_select_options" CASCADE;
  DROP TABLE "forms_blocks_select_options_locales" CASCADE;
  DROP TABLE "forms_blocks_select" CASCADE;
  DROP TABLE "forms_blocks_select_locales" CASCADE;
  DROP TABLE "forms_blocks_state" CASCADE;
  DROP TABLE "forms_blocks_state_locales" CASCADE;
  DROP TABLE "forms_blocks_text" CASCADE;
  DROP TABLE "forms_blocks_text_locales" CASCADE;
  DROP TABLE "forms_blocks_textarea" CASCADE;
  DROP TABLE "forms_blocks_textarea_locales" CASCADE;
  DROP TABLE "forms_emails" CASCADE;
  DROP TABLE "forms_emails_locales" CASCADE;
  DROP TABLE "forms" CASCADE;
  DROP TABLE "forms_locales" CASCADE;
  DROP TABLE "form_submissions_submission_data" CASCADE;
  DROP TABLE "form_submissions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "wm_web_config" CASCADE;
  DROP TABLE "wm_web_config_rels" CASCADE;
  DROP TABLE "wm_web_translations" CASCADE;
  DROP TABLE "wm_web_translations_locales" CASCADE;
  DROP TABLE "_wm_web_translations_v" CASCADE;
  DROP TABLE "_wm_web_translations_v_locales" CASCADE;
  DROP TABLE "wm_app_config_vibe_check_tracks" CASCADE;
  DROP TABLE "wm_app_config" CASCADE;
  DROP TABLE "wm_app_config_locales" CASCADE;
  DROP TABLE "wm_app_translations" CASCADE;
  DROP TABLE "wm_app_translations_locales" CASCADE;
  DROP TABLE "_wm_app_translations_v" CASCADE;
  DROP TABLE "_wm_app_translations_v_locales" CASCADE;
  DROP TABLE "wm_app_status" CASCADE;
  DROP TABLE "wm_app_status_locales" CASCADE;
  DROP TABLE "wm_app_status_rels" CASCADE;
  DROP TABLE "sy_atlas_config" CASCADE;
  DROP TABLE "sy_atlas_translations" CASCADE;
  DROP TABLE "sy_atlas_translations_locales" CASCADE;
  DROP TABLE "_sy_atlas_translations_v" CASCADE;
  DROP TABLE "_sy_atlas_translations_v_locales" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  DROP TYPE "public"."_locales";
  DROP TYPE "public"."enum_pages_tags";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_version_tags";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum__pages_v_published_locale";
  DROP TYPE "public"."enum_meditations_locale";
  DROP TYPE "public"."enum_meditations_type";
  DROP TYPE "public"."enum_meditations_status";
  DROP TYPE "public"."enum__meditations_v_version_locale";
  DROP TYPE "public"."enum__meditations_v_version_type";
  DROP TYPE "public"."enum__meditations_v_version_status";
  DROP TYPE "public"."enum__meditations_v_published_locale";
  DROP TYPE "public"."enum_videos_tags";
  DROP TYPE "public"."enum_lessons_unit";
  DROP TYPE "public"."enum_lectures_subtitles_locale";
  DROP TYPE "public"."enum_lectures_type";
  DROP TYPE "public"."enum_frames_tags";
  DROP TYPE "public"."enum_frames_image_set";
  DROP TYPE "public"."enum_narrators_gender";
  DROP TYPE "public"."enum_images_tags";
  DROP TYPE "public"."enum_audiences_location_countries";
  DROP TYPE "public"."enum_user_choices_timings";
  DROP TYPE "public"."enum_user_choices_type";
  DROP TYPE "public"."enum_subtle_system_nodes_slug";
  DROP TYPE "public"."enum_managers_roles";
  DROP TYPE "public"."enum_managers_current_project";
  DROP TYPE "public"."enum_managers_type";
  DROP TYPE "public"."enum_clients_roles";
  DROP TYPE "public"."enum_app_cards_schedule_weekdays";
  DROP TYPE "public"."enum_app_cards_target_sections";
  DROP TYPE "public"."enum_app_cards_timings";
  DROP TYPE "public"."enum_app_cards_type";
  DROP TYPE "public"."enum_app_cards_default_destination";
  DROP TYPE "public"."enum_app_cards_default_aspect_ratio";
  DROP TYPE "public"."enum_app_cards_default_text_color";
  DROP TYPE "public"."enum_app_cards_default_alignment";
  DROP TYPE "public"."enum_app_cards_starting_soon_destination";
  DROP TYPE "public"."enum_app_cards_starting_soon_aspect_ratio";
  DROP TYPE "public"."enum_app_cards_starting_soon_text_color";
  DROP TYPE "public"."enum_app_cards_starting_soon_alignment";
  DROP TYPE "public"."enum_app_cards_live_now_destination";
  DROP TYPE "public"."enum_app_cards_live_now_aspect_ratio";
  DROP TYPE "public"."enum_app_cards_live_now_text_color";
  DROP TYPE "public"."enum_app_cards_live_now_alignment";
  DROP TYPE "public"."enum_app_cards_schedule_firstdate_tz";
  DROP TYPE "public"."enum_app_cards_schedule_recurrence_type";
  DROP TYPE "public"."enum_app_cards_status";
  DROP TYPE "public"."enum__app_cards_v_version_schedule_weekdays";
  DROP TYPE "public"."enum__app_cards_v_version_target_sections";
  DROP TYPE "public"."enum__app_cards_v_version_timings";
  DROP TYPE "public"."enum__app_cards_v_version_type";
  DROP TYPE "public"."enum__app_cards_v_version_default_destination";
  DROP TYPE "public"."enum__app_cards_v_version_default_aspect_ratio";
  DROP TYPE "public"."enum__app_cards_v_version_default_text_color";
  DROP TYPE "public"."enum__app_cards_v_version_default_alignment";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_destination";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_aspect_ratio";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_text_color";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_alignment";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_destination";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_aspect_ratio";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_text_color";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_alignment";
  DROP TYPE "public"."enum__app_cards_v_version_schedule_firstdate_tz";
  DROP TYPE "public"."enum__app_cards_v_version_schedule_recurrence_type";
  DROP TYPE "public"."enum__app_cards_v_version_status";
  DROP TYPE "public"."enum__app_cards_v_published_locale";
  DROP TYPE "public"."enum_forms_confirmation_type";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_wm_web_translations_status";
  DROP TYPE "public"."enum__wm_web_translations_v_version_status";
  DROP TYPE "public"."enum__wm_web_translations_v_published_locale";
  DROP TYPE "public"."enum_wm_app_config_vibe_check_tracks_identifier";
  DROP TYPE "public"."enum_wm_app_translations_status";
  DROP TYPE "public"."enum__wm_app_translations_v_version_status";
  DROP TYPE "public"."enum__wm_app_translations_v_published_locale";
  DROP TYPE "public"."enum_wm_app_status_baseline_country";
  DROP TYPE "public"."enum_sy_atlas_translations_status";
  DROP TYPE "public"."enum__sy_atlas_translations_v_version_status";
  DROP TYPE "public"."enum__sy_atlas_translations_v_published_locale";`)
}
