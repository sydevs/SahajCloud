import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The squashed baseline: the whole schema as one migration, standing in for
 * the 137 migrations that ran before it.
 *
 * WARNING: its NAME is the name of the newest migration that was on `main`
 * when the chain was squashed. Production's `payload_migrations` already holds
 * that name, so production sees nothing pending and never runs this file.
 * Renaming it, or giving it a fresh timestamp, makes it pending in production,
 * where it would CREATE tables that exist and crash-loop the boot. A fresh
 * database (a PR preview, CI, a new laptop) has no row and runs it whole.
 *
 * The old chain inserted no reference data into a fresh database (checked with
 * a data dump of a freshly migrated database: only `payload_migrations` rows),
 * so this file is DDL only. How and when to squash: `src/migrations/AGENTS.md`,
 * "Squashing the chain".
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_pages_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_version_tags" AS ENUM('wisdom', 'lifestyle', 'creativity', 'event', 'technique');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_meditations_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_meditations_type" AS ENUM('daily', 'lesson');
  CREATE TYPE "public"."enum_meditations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__meditations_v_version_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum__meditations_v_version_type" AS ENUM('daily', 'lesson');
  CREATE TYPE "public"."enum__meditations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__meditations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_transcripts_provider" AS ENUM('lemonfox', 'imported');
  CREATE TYPE "public"."enum_videos_tags" AS ENUM('testimonial', 'workshop', 'event', 'technique');
  CREATE TYPE "public"."enum_lessons_unit" AS ENUM('Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Unit 6', 'Unit 7');
  CREATE TYPE "public"."enum_lectures_subtitles_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_lectures_type" AS ENUM('full', 'clip');
  CREATE TYPE "public"."enum_frames_tags" AS ENUM('anahat', 'back', 'bandhan', 'both hands', 'center', 'channel', 'clearing', 'earth', 'ego', 'feel', 'ham ksham', 'hamsa', 'hand', 'hands', 'left', 'lefthanded', 'massage', 'meditate', 'namaste', 'raise', 'ready', 'right', 'righthanded', 'rising', 'silent', 'superego', 'tapping');
  CREATE TYPE "public"."enum_frames_image_set" AS ENUM('male', 'female');
  CREATE TYPE "public"."enum_narrators_gender" AS ENUM('male', 'female');
  CREATE TYPE "public"."enum_images_tags" AS ENUM('landscape', 'portrait', 'square', 'thumbnail', 'author', 'icon', 'stock-photo', 'technique', 'meditation', 'placeholder', 'lesson', 'app-card');
  CREATE TYPE "public"."enum_files_spoken_language" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_audiences_location_countries" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CN', 'CX', 'CC', 'CO', 'KM', 'CG', 'CD', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GM', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MK', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'MP', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UM', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  CREATE TYPE "public"."enum_user_choices_timings" AS ENUM('morning', 'afternoon', 'evening', 'night');
  CREATE TYPE "public"."enum_user_choices_type" AS ENUM('mood', 'goal', 'duration');
  CREATE TYPE "public"."enum_subtle_system_nodes_slug" AS ENUM('mooladhara', 'swadhistan', 'nabhi', 'void', 'anahat', 'vishuddhi', 'agnya', 'sahasrara', 'kundalini', 'pingala', 'ida', 'sushumna');
  CREATE TYPE "public"."enum_managers_roles" AS ENUM('meditations-editor', 'path-editor', 'web-translator');
  CREATE TYPE "public"."enum_managers_contact_details_platform" AS ENUM('whatsapp', 'telegram', 'wechat');
  CREATE TYPE "public"."enum_managers_current_project" AS ENUM('wemeditate-web', 'wemeditate-app', 'sahaj-atlas');
  CREATE TYPE "public"."enum_managers_type" AS ENUM('inactive', 'manager', 'admin');
  CREATE TYPE "public"."enum_managers_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_clients_roles" AS ENUM('wemeditate-web-client', 'wemeditate-app-client', 'sahaj-atlas-client');
  CREATE TYPE "public"."enum_clients_mailing_list_provider" AS ENUM('mailchimp', 'brevo', 'klaviyo', 'cleverreach');
  CREATE TYPE "public"."enum_clients_site_track" AS ENUM('custom', 'wp-selfhosted', 'wp-com', 'wix', 'squarespace', 'iframe');
  CREATE TYPE "public"."enum_clients_site_embed_height" AS ENUM('fixed', 'screen', 'window');
  CREATE TYPE "public"."enum_clients_language" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_app_cards_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_app_cards_target_sections" AS ENUM('hero', 'highlights', 'lectures');
  CREATE TYPE "public"."enum_app_cards_timings" AS ENUM('morning', 'afternoon', 'evening', 'night');
  CREATE TYPE "public"."enum_app_cards_type" AS ENUM('standard', 'event');
  CREATE TYPE "public"."enum_app_cards_default_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum_app_cards_default_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum_app_cards_default_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum_app_cards_starting_soon_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum_app_cards_starting_soon_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum_app_cards_starting_soon_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum_app_cards_live_now_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum_app_cards_live_now_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum_app_cards_live_now_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum_app_cards_schedule_firstdate_tz" AS ENUM('UTC', 'Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Pago_Pago', 'US/Samoa', 'Pacific/Samoa', 'America/Adak', 'US/Aleutian', 'America/Atka', 'US/Hawaii', 'Pacific/Johnston', 'HST', 'Pacific/Tahiti', 'Pacific/Marquesas', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska', 'US/Pacific', 'PST8PDT', 'Mexico/BajaNorte', 'America/Ensenada', 'America/Santa_Isabel', 'America/Vancouver', 'Canada/Pacific', 'Pacific/Pitcairn', 'America/Ciudad_Juarez', 'America/Boise', 'MST7MDT', 'Navajo', 'US/Mountain', 'America/Shiprock', 'America/Edmonton', 'America/Cambridge_Bay', 'America/Inuvik', 'Canada/Mountain', 'America/Yellowknife', 'America/Hermosillo', 'America/Mazatlan', 'Mexico/BajaSur', 'MST', 'US/Arizona', 'America/Creston', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'Canada/Yukon', 'America/Belize', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'CST6CDT', 'US/Central', 'US/Indiana-Starke', 'America/Knox_IN', 'America/Costa_Rica', 'America/El_Salvador', 'America/Managua', 'America/Matamoros', 'America/Ojinaga', 'America/Mexico_City', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Merida', 'America/Monterrey', 'Mexico/General', 'America/Regina', 'America/Swift_Current', 'Canada/Saskatchewan', 'America/Tegucigalpa', 'America/Winnipeg', 'America/Rankin_Inlet', 'America/Resolute', 'Canada/Central', 'America/Rainy_River', 'Pacific/Easter', 'Chile/EasterIsland', 'Pacific/Galapagos', 'America/Atikokan', 'America/Cancun', 'America/Cayman', 'America/Grand_Turk', 'America/Guayaquil', 'America/Havana', 'Cuba', 'America/Jamaica', 'Jamaica', 'America/Lima', 'America/Nassau', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'US/Michigan', 'US/East-Indiana', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville', 'EST5EDT', 'US/Eastern', 'America/Panama', 'EST', 'America/Coral_Harbour', 'America/Port-au-Prince', 'America/Rio_Branco', 'America/Eirunepe', 'Brazil/Acre', 'America/Porto_Acre', 'America/Toronto', 'America/Iqaluit', 'America/Pangnirtung', 'Canada/Eastern', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Anguilla', 'America/Antigua', 'America/Aruba', 'America/Barbados', 'America/Blanc-Sablon', 'America/Curacao', 'America/Dominica', 'America/Grenada', 'America/Guadeloupe', 'America/Guyana', 'America/Halifax', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Moncton', 'Canada/Atlantic', 'America/Kralendijk', 'America/La_Paz', 'America/Lower_Princes', 'America/Manaus', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Porto_Velho', 'Brazil/West', 'America/Marigot', 'America/Martinique', 'America/Montserrat', 'America/Port_of_Spain', 'America/Puerto_Rico', 'America/Virgin', 'America/St_Barthelemy', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas', 'America/St_Vincent', 'America/Tortola', 'Chile/Continental', 'America/Santo_Domingo', 'America/Thule', 'Atlantic/Bermuda', 'America/St_Johns', 'Canada/Newfoundland', 'America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Catamarca', 'America/Argentina/ComodRivadavia', 'America/Cordoba', 'America/Rosario', 'America/Jujuy', 'America/Mendoza', 'America/Asuncion', 'America/Cayenne', 'America/Miquelon', 'America/Montevideo', 'America/Paramaribo', 'America/Punta_Arenas', 'America/Coyhaique', 'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Fortaleza', 'America/Maceio', 'America/Recife', 'America/Santarem', 'Brazil/East', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Atlantic/Stanley', 'America/Noronha', 'Brazil/DeNoronha', 'America/Nuuk', 'America/Scoresbysund', 'America/Godthab', 'Africa/Abidjan', 'Iceland', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Atlantic/Reykjavik', 'Atlantic/St_Helena', 'Africa/Timbuktu', 'Africa/Bissau', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Monrovia', 'Africa/Sao_Tome', 'America/Danmarkshavn', 'Antarctica/Troll', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Faeroe', 'Europe/Dublin', 'Eire', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Europe/Lisbon', 'Atlantic/Madeira', 'Portugal', 'WET', 'GB', 'GB-Eire', 'Europe/Belfast', 'Africa/Algiers', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Ndjamena', 'Africa/Tunis', 'Africa/Windhoek', 'Arctic/Longyearbyen', 'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Belgrade', 'Europe/Ljubljana', 'Europe/Podgorica', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Zagreb', 'Europe/Busingen', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Atlantic/Jan_Mayen', 'Europe/Bratislava', 'Europe/Brussels', 'CET', 'MET', 'Europe/Luxembourg', 'Europe/Budapest', 'Europe/Gibraltar', 'Europe/Madrid', 'Africa/Ceuta', 'Europe/Malta', 'Europe/Monaco', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Tirane', 'Europe/Vaduz', 'Europe/Vienna', 'Europe/Warsaw', 'Poland', 'Europe/Zurich', 'Africa/Blantyre', 'Africa/Bujumbura', 'Egypt', 'Africa/Gaborone', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Juba', 'Africa/Khartoum', 'Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Tripoli', 'Libya', 'Asia/Beirut', 'Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Israel', 'Asia/Tel_Aviv', 'Asia/Nicosia', 'Asia/Famagusta', 'Europe/Nicosia', 'EET', 'Europe/Bucharest', 'Europe/Chisinau', 'Europe/Tiraspol', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kiev', 'Europe/Riga', 'Europe/Sofia', 'Europe/Tallinn', 'Europe/Vilnius', 'Africa/Addis_Ababa', 'Africa/Asmara', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Nairobi', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte', 'Africa/Asmera', 'Antarctica/Syowa', 'Asia/Aden', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Damascus', 'Asia/Kuwait', 'Asia/Qatar', 'Europe/Istanbul', 'Turkey', 'Asia/Istanbul', 'Europe/Minsk', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU', 'Europe/Simferopol', 'Asia/Tehran', 'Iran', 'Asia/Muscat', 'Indian/Mahe', 'Indian/Reunion', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Samara', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Indian/Mauritius', 'Asia/Kabul', 'Antarctica/Mawson', 'Antarctica/Vostok', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Ashgabat', 'Asia/Ashkhabad', 'Asia/Dushanbe', 'Asia/Samarkand', 'Asia/Yekaterinburg', 'Indian/Kerguelen', 'Indian/Maldives', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Bishkek', 'Asia/Dacca', 'Asia/Omsk', 'Asia/Thimphu', 'Asia/Thimbu', 'Asia/Urumqi', 'Asia/Kashgar', 'Indian/Chagos', 'Asia/Yangon', 'Indian/Cocos', 'Asia/Rangoon', 'Antarctica/Davis', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Indian/Christmas', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Hovd', 'Asia/Pontianak', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk', 'Asia/Novokuznetsk', 'Asia/Tomsk', 'Antarctica/Casey', 'Asia/Brunei', 'Asia/Hong_Kong', 'Hongkong', 'Asia/Irkutsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Macau', 'Asia/Macao', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Manila', 'PRC', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Chungking', 'Singapore', 'Asia/Taipei', 'ROC', 'Asia/Ulaanbaatar', 'Asia/Choibalsan', 'Asia/Ulan_Bator', 'Australia/Perth', 'Australia/West', 'Australia/Eucla', 'Asia/Chita', 'Asia/Khandyga', 'Asia/Yakutsk', 'Asia/Dili', 'Asia/Jayapura', 'Asia/Pyongyang', 'ROK', 'Japan', 'Pacific/Palau', 'Australia/Adelaide', 'Australia/Broken_Hill', 'Australia/South', 'Australia/Yancowinna', 'Australia/Darwin', 'Australia/North', 'Antarctica/DumontDUrville', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Australia/Lindeman', 'Australia/Queensland', 'Antarctica/Macquarie', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Tasmania', 'Australia/Currie', 'Australia/Victoria', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra', 'Pacific/Chuuk', 'Pacific/Saipan', 'Pacific/Port_Moresby', 'Pacific/Yap', 'Pacific/Truk', 'Australia/Lord_Howe', 'Australia/LHI', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Srednekolymsk', 'Pacific/Bougainville', 'Pacific/Efate', 'Pacific/Guadalcanal', 'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae', 'Pacific/Norfolk', 'Antarctica/McMurdo', 'Asia/Kamchatka', 'Asia/Anadyr', 'NZ', 'Antarctica/South_Pole', 'Pacific/Funafuti', 'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Nauru', 'Pacific/Tarawa', 'Pacific/Wake', 'Pacific/Wallis', 'Pacific/Chatham', 'NZ-CHAT', 'Pacific/Apia', 'Pacific/Fakaofo', 'Pacific/Kanton', 'Pacific/Enderbury', 'Pacific/Tongatapu', 'Pacific/Kiritimati', 'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10', 'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5', 'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12');
  CREATE TYPE "public"."enum_app_cards_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum_app_cards_default_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum_app_cards_starting_soon_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum_app_cards_live_now_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum_app_cards_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__app_cards_v_version_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum__app_cards_v_version_target_sections" AS ENUM('hero', 'highlights', 'lectures');
  CREATE TYPE "public"."enum__app_cards_v_version_timings" AS ENUM('morning', 'afternoon', 'evening', 'night');
  CREATE TYPE "public"."enum__app_cards_v_version_type" AS ENUM('standard', 'event');
  CREATE TYPE "public"."enum__app_cards_v_version_default_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum__app_cards_v_version_default_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum__app_cards_v_version_default_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_aspect_ratio" AS ENUM('square', 'flexible');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_text_color" AS ENUM('black', 'white');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_alignment" AS ENUM('left', 'center');
  CREATE TYPE "public"."enum__app_cards_v_version_schedule_firstdate_tz" AS ENUM('UTC', 'Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Pago_Pago', 'US/Samoa', 'Pacific/Samoa', 'America/Adak', 'US/Aleutian', 'America/Atka', 'US/Hawaii', 'Pacific/Johnston', 'HST', 'Pacific/Tahiti', 'Pacific/Marquesas', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska', 'US/Pacific', 'PST8PDT', 'Mexico/BajaNorte', 'America/Ensenada', 'America/Santa_Isabel', 'America/Vancouver', 'Canada/Pacific', 'Pacific/Pitcairn', 'America/Ciudad_Juarez', 'America/Boise', 'MST7MDT', 'Navajo', 'US/Mountain', 'America/Shiprock', 'America/Edmonton', 'America/Cambridge_Bay', 'America/Inuvik', 'Canada/Mountain', 'America/Yellowknife', 'America/Hermosillo', 'America/Mazatlan', 'Mexico/BajaSur', 'MST', 'US/Arizona', 'America/Creston', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'Canada/Yukon', 'America/Belize', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'CST6CDT', 'US/Central', 'US/Indiana-Starke', 'America/Knox_IN', 'America/Costa_Rica', 'America/El_Salvador', 'America/Managua', 'America/Matamoros', 'America/Ojinaga', 'America/Mexico_City', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Merida', 'America/Monterrey', 'Mexico/General', 'America/Regina', 'America/Swift_Current', 'Canada/Saskatchewan', 'America/Tegucigalpa', 'America/Winnipeg', 'America/Rankin_Inlet', 'America/Resolute', 'Canada/Central', 'America/Rainy_River', 'Pacific/Easter', 'Chile/EasterIsland', 'Pacific/Galapagos', 'America/Atikokan', 'America/Cancun', 'America/Cayman', 'America/Grand_Turk', 'America/Guayaquil', 'America/Havana', 'Cuba', 'America/Jamaica', 'Jamaica', 'America/Lima', 'America/Nassau', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'US/Michigan', 'US/East-Indiana', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville', 'EST5EDT', 'US/Eastern', 'America/Panama', 'EST', 'America/Coral_Harbour', 'America/Port-au-Prince', 'America/Rio_Branco', 'America/Eirunepe', 'Brazil/Acre', 'America/Porto_Acre', 'America/Toronto', 'America/Iqaluit', 'America/Pangnirtung', 'Canada/Eastern', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Anguilla', 'America/Antigua', 'America/Aruba', 'America/Barbados', 'America/Blanc-Sablon', 'America/Curacao', 'America/Dominica', 'America/Grenada', 'America/Guadeloupe', 'America/Guyana', 'America/Halifax', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Moncton', 'Canada/Atlantic', 'America/Kralendijk', 'America/La_Paz', 'America/Lower_Princes', 'America/Manaus', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Porto_Velho', 'Brazil/West', 'America/Marigot', 'America/Martinique', 'America/Montserrat', 'America/Port_of_Spain', 'America/Puerto_Rico', 'America/Virgin', 'America/St_Barthelemy', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas', 'America/St_Vincent', 'America/Tortola', 'Chile/Continental', 'America/Santo_Domingo', 'America/Thule', 'Atlantic/Bermuda', 'America/St_Johns', 'Canada/Newfoundland', 'America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Catamarca', 'America/Argentina/ComodRivadavia', 'America/Cordoba', 'America/Rosario', 'America/Jujuy', 'America/Mendoza', 'America/Asuncion', 'America/Cayenne', 'America/Miquelon', 'America/Montevideo', 'America/Paramaribo', 'America/Punta_Arenas', 'America/Coyhaique', 'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Fortaleza', 'America/Maceio', 'America/Recife', 'America/Santarem', 'Brazil/East', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Atlantic/Stanley', 'America/Noronha', 'Brazil/DeNoronha', 'America/Nuuk', 'America/Scoresbysund', 'America/Godthab', 'Africa/Abidjan', 'Iceland', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Atlantic/Reykjavik', 'Atlantic/St_Helena', 'Africa/Timbuktu', 'Africa/Bissau', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Monrovia', 'Africa/Sao_Tome', 'America/Danmarkshavn', 'Antarctica/Troll', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Faeroe', 'Europe/Dublin', 'Eire', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Europe/Lisbon', 'Atlantic/Madeira', 'Portugal', 'WET', 'GB', 'GB-Eire', 'Europe/Belfast', 'Africa/Algiers', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Ndjamena', 'Africa/Tunis', 'Africa/Windhoek', 'Arctic/Longyearbyen', 'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Belgrade', 'Europe/Ljubljana', 'Europe/Podgorica', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Zagreb', 'Europe/Busingen', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Atlantic/Jan_Mayen', 'Europe/Bratislava', 'Europe/Brussels', 'CET', 'MET', 'Europe/Luxembourg', 'Europe/Budapest', 'Europe/Gibraltar', 'Europe/Madrid', 'Africa/Ceuta', 'Europe/Malta', 'Europe/Monaco', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Tirane', 'Europe/Vaduz', 'Europe/Vienna', 'Europe/Warsaw', 'Poland', 'Europe/Zurich', 'Africa/Blantyre', 'Africa/Bujumbura', 'Egypt', 'Africa/Gaborone', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Juba', 'Africa/Khartoum', 'Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Tripoli', 'Libya', 'Asia/Beirut', 'Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Israel', 'Asia/Tel_Aviv', 'Asia/Nicosia', 'Asia/Famagusta', 'Europe/Nicosia', 'EET', 'Europe/Bucharest', 'Europe/Chisinau', 'Europe/Tiraspol', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kiev', 'Europe/Riga', 'Europe/Sofia', 'Europe/Tallinn', 'Europe/Vilnius', 'Africa/Addis_Ababa', 'Africa/Asmara', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Nairobi', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte', 'Africa/Asmera', 'Antarctica/Syowa', 'Asia/Aden', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Damascus', 'Asia/Kuwait', 'Asia/Qatar', 'Europe/Istanbul', 'Turkey', 'Asia/Istanbul', 'Europe/Minsk', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU', 'Europe/Simferopol', 'Asia/Tehran', 'Iran', 'Asia/Muscat', 'Indian/Mahe', 'Indian/Reunion', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Samara', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Indian/Mauritius', 'Asia/Kabul', 'Antarctica/Mawson', 'Antarctica/Vostok', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Ashgabat', 'Asia/Ashkhabad', 'Asia/Dushanbe', 'Asia/Samarkand', 'Asia/Yekaterinburg', 'Indian/Kerguelen', 'Indian/Maldives', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Bishkek', 'Asia/Dacca', 'Asia/Omsk', 'Asia/Thimphu', 'Asia/Thimbu', 'Asia/Urumqi', 'Asia/Kashgar', 'Indian/Chagos', 'Asia/Yangon', 'Indian/Cocos', 'Asia/Rangoon', 'Antarctica/Davis', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Indian/Christmas', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Hovd', 'Asia/Pontianak', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk', 'Asia/Novokuznetsk', 'Asia/Tomsk', 'Antarctica/Casey', 'Asia/Brunei', 'Asia/Hong_Kong', 'Hongkong', 'Asia/Irkutsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Macau', 'Asia/Macao', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Manila', 'PRC', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Chungking', 'Singapore', 'Asia/Taipei', 'ROC', 'Asia/Ulaanbaatar', 'Asia/Choibalsan', 'Asia/Ulan_Bator', 'Australia/Perth', 'Australia/West', 'Australia/Eucla', 'Asia/Chita', 'Asia/Khandyga', 'Asia/Yakutsk', 'Asia/Dili', 'Asia/Jayapura', 'Asia/Pyongyang', 'ROK', 'Japan', 'Pacific/Palau', 'Australia/Adelaide', 'Australia/Broken_Hill', 'Australia/South', 'Australia/Yancowinna', 'Australia/Darwin', 'Australia/North', 'Antarctica/DumontDUrville', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Australia/Lindeman', 'Australia/Queensland', 'Antarctica/Macquarie', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Tasmania', 'Australia/Currie', 'Australia/Victoria', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra', 'Pacific/Chuuk', 'Pacific/Saipan', 'Pacific/Port_Moresby', 'Pacific/Yap', 'Pacific/Truk', 'Australia/Lord_Howe', 'Australia/LHI', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Srednekolymsk', 'Pacific/Bougainville', 'Pacific/Efate', 'Pacific/Guadalcanal', 'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae', 'Pacific/Norfolk', 'Antarctica/McMurdo', 'Asia/Kamchatka', 'Asia/Anadyr', 'NZ', 'Antarctica/South_Pole', 'Pacific/Funafuti', 'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Nauru', 'Pacific/Tarawa', 'Pacific/Wake', 'Pacific/Wallis', 'Pacific/Chatham', 'NZ-CHAT', 'Pacific/Apia', 'Pacific/Fakaofo', 'Pacific/Kanton', 'Pacific/Enderbury', 'Pacific/Tongatapu', 'Pacific/Kiritimati', 'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10', 'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5', 'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12');
  CREATE TYPE "public"."enum__app_cards_v_version_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum__app_cards_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum__app_cards_v_version_default_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum__app_cards_v_version_starting_soon_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum__app_cards_v_version_live_now_destination" AS ENUM('page', 'lecture', 'album', 'meditation', 'url');
  CREATE TYPE "public"."enum__app_cards_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_regions_level" AS ENUM('country', 'region', 'city', 'venue');
  CREATE TYPE "public"."enum_events_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_events_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_events_event_type" AS ENUM('offline', 'online');
  CREATE TYPE "public"."enum_events_schedule_firstdate_tz" AS ENUM('UTC', 'Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Pago_Pago', 'US/Samoa', 'Pacific/Samoa', 'America/Adak', 'US/Aleutian', 'America/Atka', 'US/Hawaii', 'Pacific/Johnston', 'HST', 'Pacific/Tahiti', 'Pacific/Marquesas', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska', 'US/Pacific', 'PST8PDT', 'Mexico/BajaNorte', 'America/Ensenada', 'America/Santa_Isabel', 'America/Vancouver', 'Canada/Pacific', 'Pacific/Pitcairn', 'America/Ciudad_Juarez', 'America/Boise', 'MST7MDT', 'Navajo', 'US/Mountain', 'America/Shiprock', 'America/Edmonton', 'America/Cambridge_Bay', 'America/Inuvik', 'Canada/Mountain', 'America/Yellowknife', 'America/Hermosillo', 'America/Mazatlan', 'Mexico/BajaSur', 'MST', 'US/Arizona', 'America/Creston', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'Canada/Yukon', 'America/Belize', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'CST6CDT', 'US/Central', 'US/Indiana-Starke', 'America/Knox_IN', 'America/Costa_Rica', 'America/El_Salvador', 'America/Managua', 'America/Matamoros', 'America/Ojinaga', 'America/Mexico_City', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Merida', 'America/Monterrey', 'Mexico/General', 'America/Regina', 'America/Swift_Current', 'Canada/Saskatchewan', 'America/Tegucigalpa', 'America/Winnipeg', 'America/Rankin_Inlet', 'America/Resolute', 'Canada/Central', 'America/Rainy_River', 'Pacific/Easter', 'Chile/EasterIsland', 'Pacific/Galapagos', 'America/Atikokan', 'America/Cancun', 'America/Cayman', 'America/Grand_Turk', 'America/Guayaquil', 'America/Havana', 'Cuba', 'America/Jamaica', 'Jamaica', 'America/Lima', 'America/Nassau', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'US/Michigan', 'US/East-Indiana', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville', 'EST5EDT', 'US/Eastern', 'America/Panama', 'EST', 'America/Coral_Harbour', 'America/Port-au-Prince', 'America/Rio_Branco', 'America/Eirunepe', 'Brazil/Acre', 'America/Porto_Acre', 'America/Toronto', 'America/Iqaluit', 'America/Pangnirtung', 'Canada/Eastern', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Anguilla', 'America/Antigua', 'America/Aruba', 'America/Barbados', 'America/Blanc-Sablon', 'America/Curacao', 'America/Dominica', 'America/Grenada', 'America/Guadeloupe', 'America/Guyana', 'America/Halifax', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Moncton', 'Canada/Atlantic', 'America/Kralendijk', 'America/La_Paz', 'America/Lower_Princes', 'America/Manaus', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Porto_Velho', 'Brazil/West', 'America/Marigot', 'America/Martinique', 'America/Montserrat', 'America/Port_of_Spain', 'America/Puerto_Rico', 'America/Virgin', 'America/St_Barthelemy', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas', 'America/St_Vincent', 'America/Tortola', 'Chile/Continental', 'America/Santo_Domingo', 'America/Thule', 'Atlantic/Bermuda', 'America/St_Johns', 'Canada/Newfoundland', 'America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Catamarca', 'America/Argentina/ComodRivadavia', 'America/Cordoba', 'America/Rosario', 'America/Jujuy', 'America/Mendoza', 'America/Asuncion', 'America/Cayenne', 'America/Miquelon', 'America/Montevideo', 'America/Paramaribo', 'America/Punta_Arenas', 'America/Coyhaique', 'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Fortaleza', 'America/Maceio', 'America/Recife', 'America/Santarem', 'Brazil/East', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Atlantic/Stanley', 'America/Noronha', 'Brazil/DeNoronha', 'America/Nuuk', 'America/Scoresbysund', 'America/Godthab', 'Africa/Abidjan', 'Iceland', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Atlantic/Reykjavik', 'Atlantic/St_Helena', 'Africa/Timbuktu', 'Africa/Bissau', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Monrovia', 'Africa/Sao_Tome', 'America/Danmarkshavn', 'Antarctica/Troll', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Faeroe', 'Europe/Dublin', 'Eire', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Europe/Lisbon', 'Atlantic/Madeira', 'Portugal', 'WET', 'GB', 'GB-Eire', 'Europe/Belfast', 'Africa/Algiers', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Ndjamena', 'Africa/Tunis', 'Africa/Windhoek', 'Arctic/Longyearbyen', 'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Belgrade', 'Europe/Ljubljana', 'Europe/Podgorica', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Zagreb', 'Europe/Busingen', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Atlantic/Jan_Mayen', 'Europe/Bratislava', 'Europe/Brussels', 'CET', 'MET', 'Europe/Luxembourg', 'Europe/Budapest', 'Europe/Gibraltar', 'Europe/Madrid', 'Africa/Ceuta', 'Europe/Malta', 'Europe/Monaco', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Tirane', 'Europe/Vaduz', 'Europe/Vienna', 'Europe/Warsaw', 'Poland', 'Europe/Zurich', 'Africa/Blantyre', 'Africa/Bujumbura', 'Egypt', 'Africa/Gaborone', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Juba', 'Africa/Khartoum', 'Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Tripoli', 'Libya', 'Asia/Beirut', 'Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Israel', 'Asia/Tel_Aviv', 'Asia/Nicosia', 'Asia/Famagusta', 'Europe/Nicosia', 'EET', 'Europe/Bucharest', 'Europe/Chisinau', 'Europe/Tiraspol', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kiev', 'Europe/Riga', 'Europe/Sofia', 'Europe/Tallinn', 'Europe/Vilnius', 'Africa/Addis_Ababa', 'Africa/Asmara', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Nairobi', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte', 'Africa/Asmera', 'Antarctica/Syowa', 'Asia/Aden', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Damascus', 'Asia/Kuwait', 'Asia/Qatar', 'Europe/Istanbul', 'Turkey', 'Asia/Istanbul', 'Europe/Minsk', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU', 'Europe/Simferopol', 'Asia/Tehran', 'Iran', 'Asia/Muscat', 'Indian/Mahe', 'Indian/Reunion', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Samara', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Indian/Mauritius', 'Asia/Kabul', 'Antarctica/Mawson', 'Antarctica/Vostok', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Ashgabat', 'Asia/Ashkhabad', 'Asia/Dushanbe', 'Asia/Samarkand', 'Asia/Yekaterinburg', 'Indian/Kerguelen', 'Indian/Maldives', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Bishkek', 'Asia/Dacca', 'Asia/Omsk', 'Asia/Thimphu', 'Asia/Thimbu', 'Asia/Urumqi', 'Asia/Kashgar', 'Indian/Chagos', 'Asia/Yangon', 'Indian/Cocos', 'Asia/Rangoon', 'Antarctica/Davis', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Indian/Christmas', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Hovd', 'Asia/Pontianak', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk', 'Asia/Novokuznetsk', 'Asia/Tomsk', 'Antarctica/Casey', 'Asia/Brunei', 'Asia/Hong_Kong', 'Hongkong', 'Asia/Irkutsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Macau', 'Asia/Macao', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Manila', 'PRC', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Chungking', 'Singapore', 'Asia/Taipei', 'ROC', 'Asia/Ulaanbaatar', 'Asia/Choibalsan', 'Asia/Ulan_Bator', 'Australia/Perth', 'Australia/West', 'Australia/Eucla', 'Asia/Chita', 'Asia/Khandyga', 'Asia/Yakutsk', 'Asia/Dili', 'Asia/Jayapura', 'Asia/Pyongyang', 'ROK', 'Japan', 'Pacific/Palau', 'Australia/Adelaide', 'Australia/Broken_Hill', 'Australia/South', 'Australia/Yancowinna', 'Australia/Darwin', 'Australia/North', 'Antarctica/DumontDUrville', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Australia/Lindeman', 'Australia/Queensland', 'Antarctica/Macquarie', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Tasmania', 'Australia/Currie', 'Australia/Victoria', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra', 'Pacific/Chuuk', 'Pacific/Saipan', 'Pacific/Port_Moresby', 'Pacific/Yap', 'Pacific/Truk', 'Australia/Lord_Howe', 'Australia/LHI', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Srednekolymsk', 'Pacific/Bougainville', 'Pacific/Efate', 'Pacific/Guadalcanal', 'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae', 'Pacific/Norfolk', 'Antarctica/McMurdo', 'Asia/Kamchatka', 'Asia/Anadyr', 'NZ', 'Antarctica/South_Pole', 'Pacific/Funafuti', 'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Nauru', 'Pacific/Tarawa', 'Pacific/Wake', 'Pacific/Wallis', 'Pacific/Chatham', 'NZ-CHAT', 'Pacific/Apia', 'Pacific/Fakaofo', 'Pacific/Kanton', 'Pacific/Enderbury', 'Pacific/Tongatapu', 'Pacific/Kiritimati', 'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10', 'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5', 'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12');
  CREATE TYPE "public"."enum_events_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum_events_schedule_monthly_mode" AS ENUM('date', 'weekday');
  CREATE TYPE "public"."enum_events_schedule_week_number" AS ENUM('1', '2', '3', '4', '-1');
  CREATE TYPE "public"."enum_events_schedule_weekday_of_month" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum_events_schedule_ending_type" AS ENUM('count', 'until');
  CREATE TYPE "public"."enum_events_registration_mode" AS ENUM('sahaj-atlas', 'external');
  CREATE TYPE "public"."enum_events_registration_notification_frequency" AS ENUM('Immediate', 'Never');
  CREATE TYPE "public"."enum_events_verification_stage" AS ENUM('unverified', 'denied', 'verified', 'reminded', 'escalated', 'urgent', 'expired', 'finished');
  CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__events_v_version_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum__events_v_version_schedule_weekdays" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum__events_v_version_event_type" AS ENUM('offline', 'online');
  CREATE TYPE "public"."enum__events_v_version_schedule_firstdate_tz" AS ENUM('UTC', 'Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Pago_Pago', 'US/Samoa', 'Pacific/Samoa', 'America/Adak', 'US/Aleutian', 'America/Atka', 'US/Hawaii', 'Pacific/Johnston', 'HST', 'Pacific/Tahiti', 'Pacific/Marquesas', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska', 'US/Pacific', 'PST8PDT', 'Mexico/BajaNorte', 'America/Ensenada', 'America/Santa_Isabel', 'America/Vancouver', 'Canada/Pacific', 'Pacific/Pitcairn', 'America/Ciudad_Juarez', 'America/Boise', 'MST7MDT', 'Navajo', 'US/Mountain', 'America/Shiprock', 'America/Edmonton', 'America/Cambridge_Bay', 'America/Inuvik', 'Canada/Mountain', 'America/Yellowknife', 'America/Hermosillo', 'America/Mazatlan', 'Mexico/BajaSur', 'MST', 'US/Arizona', 'America/Creston', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'Canada/Yukon', 'America/Belize', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'CST6CDT', 'US/Central', 'US/Indiana-Starke', 'America/Knox_IN', 'America/Costa_Rica', 'America/El_Salvador', 'America/Managua', 'America/Matamoros', 'America/Ojinaga', 'America/Mexico_City', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Merida', 'America/Monterrey', 'Mexico/General', 'America/Regina', 'America/Swift_Current', 'Canada/Saskatchewan', 'America/Tegucigalpa', 'America/Winnipeg', 'America/Rankin_Inlet', 'America/Resolute', 'Canada/Central', 'America/Rainy_River', 'Pacific/Easter', 'Chile/EasterIsland', 'Pacific/Galapagos', 'America/Atikokan', 'America/Cancun', 'America/Cayman', 'America/Grand_Turk', 'America/Guayaquil', 'America/Havana', 'Cuba', 'America/Jamaica', 'Jamaica', 'America/Lima', 'America/Nassau', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'US/Michigan', 'US/East-Indiana', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville', 'EST5EDT', 'US/Eastern', 'America/Panama', 'EST', 'America/Coral_Harbour', 'America/Port-au-Prince', 'America/Rio_Branco', 'America/Eirunepe', 'Brazil/Acre', 'America/Porto_Acre', 'America/Toronto', 'America/Iqaluit', 'America/Pangnirtung', 'Canada/Eastern', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Anguilla', 'America/Antigua', 'America/Aruba', 'America/Barbados', 'America/Blanc-Sablon', 'America/Curacao', 'America/Dominica', 'America/Grenada', 'America/Guadeloupe', 'America/Guyana', 'America/Halifax', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Moncton', 'Canada/Atlantic', 'America/Kralendijk', 'America/La_Paz', 'America/Lower_Princes', 'America/Manaus', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Porto_Velho', 'Brazil/West', 'America/Marigot', 'America/Martinique', 'America/Montserrat', 'America/Port_of_Spain', 'America/Puerto_Rico', 'America/Virgin', 'America/St_Barthelemy', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas', 'America/St_Vincent', 'America/Tortola', 'Chile/Continental', 'America/Santo_Domingo', 'America/Thule', 'Atlantic/Bermuda', 'America/St_Johns', 'Canada/Newfoundland', 'America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Catamarca', 'America/Argentina/ComodRivadavia', 'America/Cordoba', 'America/Rosario', 'America/Jujuy', 'America/Mendoza', 'America/Asuncion', 'America/Cayenne', 'America/Miquelon', 'America/Montevideo', 'America/Paramaribo', 'America/Punta_Arenas', 'America/Coyhaique', 'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Fortaleza', 'America/Maceio', 'America/Recife', 'America/Santarem', 'Brazil/East', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Atlantic/Stanley', 'America/Noronha', 'Brazil/DeNoronha', 'America/Nuuk', 'America/Scoresbysund', 'America/Godthab', 'Africa/Abidjan', 'Iceland', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Atlantic/Reykjavik', 'Atlantic/St_Helena', 'Africa/Timbuktu', 'Africa/Bissau', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Monrovia', 'Africa/Sao_Tome', 'America/Danmarkshavn', 'Antarctica/Troll', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Faeroe', 'Europe/Dublin', 'Eire', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Europe/Lisbon', 'Atlantic/Madeira', 'Portugal', 'WET', 'GB', 'GB-Eire', 'Europe/Belfast', 'Africa/Algiers', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Ndjamena', 'Africa/Tunis', 'Africa/Windhoek', 'Arctic/Longyearbyen', 'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Belgrade', 'Europe/Ljubljana', 'Europe/Podgorica', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Zagreb', 'Europe/Busingen', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Atlantic/Jan_Mayen', 'Europe/Bratislava', 'Europe/Brussels', 'CET', 'MET', 'Europe/Luxembourg', 'Europe/Budapest', 'Europe/Gibraltar', 'Europe/Madrid', 'Africa/Ceuta', 'Europe/Malta', 'Europe/Monaco', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Tirane', 'Europe/Vaduz', 'Europe/Vienna', 'Europe/Warsaw', 'Poland', 'Europe/Zurich', 'Africa/Blantyre', 'Africa/Bujumbura', 'Egypt', 'Africa/Gaborone', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Juba', 'Africa/Khartoum', 'Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Tripoli', 'Libya', 'Asia/Beirut', 'Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Israel', 'Asia/Tel_Aviv', 'Asia/Nicosia', 'Asia/Famagusta', 'Europe/Nicosia', 'EET', 'Europe/Bucharest', 'Europe/Chisinau', 'Europe/Tiraspol', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kiev', 'Europe/Riga', 'Europe/Sofia', 'Europe/Tallinn', 'Europe/Vilnius', 'Africa/Addis_Ababa', 'Africa/Asmara', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Nairobi', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte', 'Africa/Asmera', 'Antarctica/Syowa', 'Asia/Aden', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Damascus', 'Asia/Kuwait', 'Asia/Qatar', 'Europe/Istanbul', 'Turkey', 'Asia/Istanbul', 'Europe/Minsk', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU', 'Europe/Simferopol', 'Asia/Tehran', 'Iran', 'Asia/Muscat', 'Indian/Mahe', 'Indian/Reunion', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Samara', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Indian/Mauritius', 'Asia/Kabul', 'Antarctica/Mawson', 'Antarctica/Vostok', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Ashgabat', 'Asia/Ashkhabad', 'Asia/Dushanbe', 'Asia/Samarkand', 'Asia/Yekaterinburg', 'Indian/Kerguelen', 'Indian/Maldives', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Bishkek', 'Asia/Dacca', 'Asia/Omsk', 'Asia/Thimphu', 'Asia/Thimbu', 'Asia/Urumqi', 'Asia/Kashgar', 'Indian/Chagos', 'Asia/Yangon', 'Indian/Cocos', 'Asia/Rangoon', 'Antarctica/Davis', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Indian/Christmas', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Hovd', 'Asia/Pontianak', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk', 'Asia/Novokuznetsk', 'Asia/Tomsk', 'Antarctica/Casey', 'Asia/Brunei', 'Asia/Hong_Kong', 'Hongkong', 'Asia/Irkutsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Macau', 'Asia/Macao', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Manila', 'PRC', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Chungking', 'Singapore', 'Asia/Taipei', 'ROC', 'Asia/Ulaanbaatar', 'Asia/Choibalsan', 'Asia/Ulan_Bator', 'Australia/Perth', 'Australia/West', 'Australia/Eucla', 'Asia/Chita', 'Asia/Khandyga', 'Asia/Yakutsk', 'Asia/Dili', 'Asia/Jayapura', 'Asia/Pyongyang', 'ROK', 'Japan', 'Pacific/Palau', 'Australia/Adelaide', 'Australia/Broken_Hill', 'Australia/South', 'Australia/Yancowinna', 'Australia/Darwin', 'Australia/North', 'Antarctica/DumontDUrville', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Australia/Lindeman', 'Australia/Queensland', 'Antarctica/Macquarie', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Tasmania', 'Australia/Currie', 'Australia/Victoria', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra', 'Pacific/Chuuk', 'Pacific/Saipan', 'Pacific/Port_Moresby', 'Pacific/Yap', 'Pacific/Truk', 'Australia/Lord_Howe', 'Australia/LHI', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Srednekolymsk', 'Pacific/Bougainville', 'Pacific/Efate', 'Pacific/Guadalcanal', 'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae', 'Pacific/Norfolk', 'Antarctica/McMurdo', 'Asia/Kamchatka', 'Asia/Anadyr', 'NZ', 'Antarctica/South_Pole', 'Pacific/Funafuti', 'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Nauru', 'Pacific/Tarawa', 'Pacific/Wake', 'Pacific/Wallis', 'Pacific/Chatham', 'NZ-CHAT', 'Pacific/Apia', 'Pacific/Fakaofo', 'Pacific/Kanton', 'Pacific/Enderbury', 'Pacific/Tongatapu', 'Pacific/Kiritimati', 'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10', 'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5', 'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12');
  CREATE TYPE "public"."enum__events_v_version_schedule_recurrence_type" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');
  CREATE TYPE "public"."enum__events_v_version_schedule_monthly_mode" AS ENUM('date', 'weekday');
  CREATE TYPE "public"."enum__events_v_version_schedule_week_number" AS ENUM('1', '2', '3', '4', '-1');
  CREATE TYPE "public"."enum__events_v_version_schedule_weekday_of_month" AS ENUM('MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU');
  CREATE TYPE "public"."enum__events_v_version_schedule_ending_type" AS ENUM('count', 'until');
  CREATE TYPE "public"."enum__events_v_version_registration_mode" AS ENUM('sahaj-atlas', 'external');
  CREATE TYPE "public"."enum__events_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__events_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_imports_default_languages" AS ENUM('ab', 'aa', 'af', 'ak', 'sq', 'am', 'ar', 'an', 'hy', 'as', 'av', 'ae', 'ay', 'az', 'bm', 'ba', 'eu', 'be', 'bn', 'bi', 'bs', 'br', 'bg', 'my', 'ca', 'ch', 'ce', 'ny', 'zh', 'cv', 'kw', 'co', 'cr', 'hr', 'cs', 'da', 'dv', 'nl', 'dz', 'en', 'eo', 'et', 'ee', 'fo', 'fj', 'fi', 'fr', 'ff', 'gl', 'lg', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'he', 'hz', 'hi', 'ho', 'hu', 'is', 'io', 'ig', 'id', 'ia', 'ie', 'iu', 'ik', 'ga', 'it', 'ja', 'jv', 'kl', 'kn', 'kr', 'ks', 'kk', 'km', 'ki', 'rw', 'rn', 'kv', 'kg', 'ko', 'ku', 'kj', 'ky', 'lo', 'la', 'lv', 'li', 'ln', 'lt', 'lu', 'lb', 'mk', 'mg', 'ms', 'ml', 'mt', 'gv', 'mi', 'mr', 'mh', 'mn', 'na', 'nv', 'ng', 'ne', 'nd', 'se', 'no', 'nb', 'nn', 'ii', 'oc', 'oj', 'cu', 'or', 'om', 'os', 'pi', 'pa', 'ps', 'fa', 'pl', 'pt', 'qu', 'ro', 'rm', 'ru', 'sm', 'sg', 'sa', 'sc', 'gd', 'sr', 'sn', 'sd', 'si', 'sk', 'sl', 'so', 'nr', 'st', 'es', 'su', 'sw', 'ss', 'sv', 'tl', 'ty', 'tg', 'ta', 'tt', 'te', 'th', 'bo', 'ti', 'to', 'ts', 'tn', 'tr', 'tk', 'tw', 'uk', 'ur', 'ug', 'uz', 've', 'vi', 'vo', 'wa', 'cy', 'fy', 'wo', 'xh', 'yi', 'yo', 'za', 'zu');
  CREATE TYPE "public"."enum_imports_status" AS ENUM('pending', 'review', 'completed', 'failed');
  CREATE TYPE "public"."enum_forms_confirmation_type" AS ENUM('message', 'redirect');
  CREATE TYPE "public"."enum_forms_action_type" AS ENUM('contact', 'subscribe');
  CREATE TYPE "public"."enum_user_submissions_startingat_tz" AS ENUM('UTC', 'Pacific/Midway', 'Pacific/Niue', 'Pacific/Honolulu', 'Pacific/Rarotonga', 'America/Anchorage', 'Pacific/Gambier', 'America/Los_Angeles', 'America/Tijuana', 'America/Denver', 'America/Phoenix', 'America/Chicago', 'America/Guatemala', 'America/New_York', 'America/Bogota', 'America/Caracas', 'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores', 'Atlantic/Cape_Verde', 'Europe/London', 'Europe/Berlin', 'Africa/Lagos', 'Europe/Athens', 'Africa/Cairo', 'Europe/Moscow', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Baku', 'Asia/Karachi', 'Asia/Tashkent', 'Asia/Calcutta', 'Asia/Dhaka', 'Asia/Almaty', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Brisbane', 'Australia/Sydney', 'Pacific/Guam', 'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Pago_Pago', 'US/Samoa', 'Pacific/Samoa', 'America/Adak', 'US/Aleutian', 'America/Atka', 'US/Hawaii', 'Pacific/Johnston', 'HST', 'Pacific/Tahiti', 'Pacific/Marquesas', 'America/Juneau', 'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat', 'US/Alaska', 'US/Pacific', 'PST8PDT', 'Mexico/BajaNorte', 'America/Ensenada', 'America/Santa_Isabel', 'America/Vancouver', 'Canada/Pacific', 'Pacific/Pitcairn', 'America/Ciudad_Juarez', 'America/Boise', 'MST7MDT', 'Navajo', 'US/Mountain', 'America/Shiprock', 'America/Edmonton', 'America/Cambridge_Bay', 'America/Inuvik', 'Canada/Mountain', 'America/Yellowknife', 'America/Hermosillo', 'America/Mazatlan', 'Mexico/BajaSur', 'MST', 'US/Arizona', 'America/Creston', 'America/Whitehorse', 'America/Dawson', 'America/Dawson_Creek', 'America/Fort_Nelson', 'Canada/Yukon', 'America/Belize', 'America/Indiana/Knox', 'America/Indiana/Tell_City', 'America/Menominee', 'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'CST6CDT', 'US/Central', 'US/Indiana-Starke', 'America/Knox_IN', 'America/Costa_Rica', 'America/El_Salvador', 'America/Managua', 'America/Matamoros', 'America/Ojinaga', 'America/Mexico_City', 'America/Bahia_Banderas', 'America/Chihuahua', 'America/Merida', 'America/Monterrey', 'Mexico/General', 'America/Regina', 'America/Swift_Current', 'Canada/Saskatchewan', 'America/Tegucigalpa', 'America/Winnipeg', 'America/Rankin_Inlet', 'America/Resolute', 'Canada/Central', 'America/Rainy_River', 'Pacific/Easter', 'Chile/EasterIsland', 'Pacific/Galapagos', 'America/Atikokan', 'America/Cancun', 'America/Cayman', 'America/Grand_Turk', 'America/Guayaquil', 'America/Havana', 'Cuba', 'America/Jamaica', 'Jamaica', 'America/Lima', 'America/Nassau', 'America/Detroit', 'America/Indiana/Indianapolis', 'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay', 'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello', 'US/Michigan', 'US/East-Indiana', 'America/Indianapolis', 'America/Fort_Wayne', 'America/Louisville', 'EST5EDT', 'US/Eastern', 'America/Panama', 'EST', 'America/Coral_Harbour', 'America/Port-au-Prince', 'America/Rio_Branco', 'America/Eirunepe', 'Brazil/Acre', 'America/Porto_Acre', 'America/Toronto', 'America/Iqaluit', 'America/Pangnirtung', 'Canada/Eastern', 'America/Montreal', 'America/Nipigon', 'America/Thunder_Bay', 'America/Anguilla', 'America/Antigua', 'America/Aruba', 'America/Barbados', 'America/Blanc-Sablon', 'America/Curacao', 'America/Dominica', 'America/Grenada', 'America/Guadeloupe', 'America/Guyana', 'America/Halifax', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Moncton', 'Canada/Atlantic', 'America/Kralendijk', 'America/La_Paz', 'America/Lower_Princes', 'America/Manaus', 'America/Boa_Vista', 'America/Campo_Grande', 'America/Cuiaba', 'America/Porto_Velho', 'Brazil/West', 'America/Marigot', 'America/Martinique', 'America/Montserrat', 'America/Port_of_Spain', 'America/Puerto_Rico', 'America/Virgin', 'America/St_Barthelemy', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas', 'America/St_Vincent', 'America/Tortola', 'Chile/Continental', 'America/Santo_Domingo', 'America/Thule', 'Atlantic/Bermuda', 'America/St_Johns', 'Canada/Newfoundland', 'America/Argentina/Buenos_Aires', 'America/Argentina/Catamarca', 'America/Argentina/Cordoba', 'America/Argentina/Jujuy', 'America/Argentina/La_Rioja', 'America/Argentina/Mendoza', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta', 'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia', 'America/Catamarca', 'America/Argentina/ComodRivadavia', 'America/Cordoba', 'America/Rosario', 'America/Jujuy', 'America/Mendoza', 'America/Asuncion', 'America/Cayenne', 'America/Miquelon', 'America/Montevideo', 'America/Paramaribo', 'America/Punta_Arenas', 'America/Coyhaique', 'America/Araguaina', 'America/Bahia', 'America/Belem', 'America/Fortaleza', 'America/Maceio', 'America/Recife', 'America/Santarem', 'Brazil/East', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Atlantic/Stanley', 'America/Noronha', 'Brazil/DeNoronha', 'America/Nuuk', 'America/Scoresbysund', 'America/Godthab', 'Africa/Abidjan', 'Iceland', 'Africa/Accra', 'Africa/Bamako', 'Africa/Banjul', 'Africa/Conakry', 'Africa/Dakar', 'Africa/Freetown', 'Africa/Lome', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Atlantic/Reykjavik', 'Atlantic/St_Helena', 'Africa/Timbuktu', 'Africa/Bissau', 'Africa/Casablanca', 'Africa/El_Aaiun', 'Africa/Monrovia', 'Africa/Sao_Tome', 'America/Danmarkshavn', 'Antarctica/Troll', 'Atlantic/Canary', 'Atlantic/Faroe', 'Atlantic/Faeroe', 'Europe/Dublin', 'Eire', 'Europe/Guernsey', 'Europe/Isle_of_Man', 'Europe/Jersey', 'Europe/Lisbon', 'Atlantic/Madeira', 'Portugal', 'WET', 'GB', 'GB-Eire', 'Europe/Belfast', 'Africa/Algiers', 'Africa/Bangui', 'Africa/Brazzaville', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Libreville', 'Africa/Luanda', 'Africa/Malabo', 'Africa/Niamey', 'Africa/Porto-Novo', 'Africa/Ndjamena', 'Africa/Tunis', 'Africa/Windhoek', 'Arctic/Longyearbyen', 'Europe/Amsterdam', 'Europe/Andorra', 'Europe/Belgrade', 'Europe/Ljubljana', 'Europe/Podgorica', 'Europe/Sarajevo', 'Europe/Skopje', 'Europe/Zagreb', 'Europe/Busingen', 'Europe/Copenhagen', 'Europe/Oslo', 'Europe/Stockholm', 'Atlantic/Jan_Mayen', 'Europe/Bratislava', 'Europe/Brussels', 'CET', 'MET', 'Europe/Luxembourg', 'Europe/Budapest', 'Europe/Gibraltar', 'Europe/Madrid', 'Africa/Ceuta', 'Europe/Malta', 'Europe/Monaco', 'Europe/Paris', 'Europe/Prague', 'Europe/Rome', 'Europe/San_Marino', 'Europe/Vatican', 'Europe/Tirane', 'Europe/Vaduz', 'Europe/Vienna', 'Europe/Warsaw', 'Poland', 'Europe/Zurich', 'Africa/Blantyre', 'Africa/Bujumbura', 'Egypt', 'Africa/Gaborone', 'Africa/Harare', 'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Juba', 'Africa/Khartoum', 'Africa/Kigali', 'Africa/Lubumbashi', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Tripoli', 'Libya', 'Asia/Beirut', 'Asia/Hebron', 'Asia/Gaza', 'Asia/Jerusalem', 'Israel', 'Asia/Tel_Aviv', 'Asia/Nicosia', 'Asia/Famagusta', 'Europe/Nicosia', 'EET', 'Europe/Bucharest', 'Europe/Chisinau', 'Europe/Tiraspol', 'Europe/Helsinki', 'Europe/Mariehamn', 'Europe/Kaliningrad', 'Europe/Kyiv', 'Europe/Uzhgorod', 'Europe/Zaporozhye', 'Europe/Kiev', 'Europe/Riga', 'Europe/Sofia', 'Europe/Tallinn', 'Europe/Vilnius', 'Africa/Addis_Ababa', 'Africa/Asmara', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Kampala', 'Africa/Mogadishu', 'Africa/Nairobi', 'Indian/Antananarivo', 'Indian/Comoro', 'Indian/Mayotte', 'Africa/Asmera', 'Antarctica/Syowa', 'Asia/Aden', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Bahrain', 'Asia/Damascus', 'Asia/Kuwait', 'Asia/Qatar', 'Europe/Istanbul', 'Turkey', 'Asia/Istanbul', 'Europe/Minsk', 'Europe/Kirov', 'Europe/Volgograd', 'W-SU', 'Europe/Simferopol', 'Asia/Tehran', 'Iran', 'Asia/Muscat', 'Indian/Mahe', 'Indian/Reunion', 'Asia/Tbilisi', 'Asia/Yerevan', 'Europe/Samara', 'Europe/Astrakhan', 'Europe/Saratov', 'Europe/Ulyanovsk', 'Indian/Mauritius', 'Asia/Kabul', 'Antarctica/Mawson', 'Antarctica/Vostok', 'Asia/Aqtau', 'Asia/Aqtobe', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qostanay', 'Asia/Qyzylorda', 'Asia/Ashgabat', 'Asia/Ashkhabad', 'Asia/Dushanbe', 'Asia/Samarkand', 'Asia/Yekaterinburg', 'Indian/Kerguelen', 'Indian/Maldives', 'Asia/Colombo', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Katmandu', 'Asia/Bishkek', 'Asia/Dacca', 'Asia/Omsk', 'Asia/Thimphu', 'Asia/Thimbu', 'Asia/Urumqi', 'Asia/Kashgar', 'Indian/Chagos', 'Asia/Yangon', 'Indian/Cocos', 'Asia/Rangoon', 'Antarctica/Davis', 'Asia/Phnom_Penh', 'Asia/Vientiane', 'Indian/Christmas', 'Asia/Ho_Chi_Minh', 'Asia/Saigon', 'Asia/Hovd', 'Asia/Pontianak', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Krasnoyarsk', 'Asia/Novokuznetsk', 'Asia/Tomsk', 'Antarctica/Casey', 'Asia/Brunei', 'Asia/Hong_Kong', 'Hongkong', 'Asia/Irkutsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching', 'Asia/Macau', 'Asia/Macao', 'Asia/Makassar', 'Asia/Ujung_Pandang', 'Asia/Manila', 'PRC', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Chungking', 'Singapore', 'Asia/Taipei', 'ROC', 'Asia/Ulaanbaatar', 'Asia/Choibalsan', 'Asia/Ulan_Bator', 'Australia/Perth', 'Australia/West', 'Australia/Eucla', 'Asia/Chita', 'Asia/Khandyga', 'Asia/Yakutsk', 'Asia/Dili', 'Asia/Jayapura', 'Asia/Pyongyang', 'ROK', 'Japan', 'Pacific/Palau', 'Australia/Adelaide', 'Australia/Broken_Hill', 'Australia/South', 'Australia/Yancowinna', 'Australia/Darwin', 'Australia/North', 'Antarctica/DumontDUrville', 'Asia/Vladivostok', 'Asia/Ust-Nera', 'Australia/Lindeman', 'Australia/Queensland', 'Antarctica/Macquarie', 'Australia/Hobart', 'Australia/Melbourne', 'Australia/Tasmania', 'Australia/Currie', 'Australia/Victoria', 'Australia/ACT', 'Australia/NSW', 'Australia/Canberra', 'Pacific/Chuuk', 'Pacific/Saipan', 'Pacific/Port_Moresby', 'Pacific/Yap', 'Pacific/Truk', 'Australia/Lord_Howe', 'Australia/LHI', 'Asia/Sakhalin', 'Asia/Magadan', 'Asia/Srednekolymsk', 'Pacific/Bougainville', 'Pacific/Efate', 'Pacific/Guadalcanal', 'Pacific/Pohnpei', 'Pacific/Ponape', 'Pacific/Kosrae', 'Pacific/Norfolk', 'Antarctica/McMurdo', 'Asia/Kamchatka', 'Asia/Anadyr', 'NZ', 'Antarctica/South_Pole', 'Pacific/Funafuti', 'Pacific/Majuro', 'Pacific/Kwajalein', 'Kwajalein', 'Pacific/Nauru', 'Pacific/Tarawa', 'Pacific/Wake', 'Pacific/Wallis', 'Pacific/Chatham', 'NZ-CHAT', 'Pacific/Apia', 'Pacific/Fakaofo', 'Pacific/Kanton', 'Pacific/Enderbury', 'Pacific/Tongatapu', 'Pacific/Kiritimati', 'Etc/GMT-14', 'Etc/GMT-13', 'Etc/GMT-12', 'Etc/GMT-11', 'Etc/GMT-10', 'Etc/GMT-9', 'Etc/GMT-8', 'Etc/GMT-7', 'Etc/GMT-6', 'Etc/GMT-5', 'Etc/GMT-4', 'Etc/GMT-3', 'Etc/GMT-2', 'Etc/GMT-1', 'Etc/GMT', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11', 'Etc/GMT+12');
  CREATE TYPE "public"."enum_user_submissions_event_feedback" AS ENUM('confirmed', 'denied');
  CREATE TYPE "public"."enum_user_submissions_type" AS ENUM('contact', 'subscribe', 'registration', 'proposal');
  CREATE TYPE "public"."enum_user_submissions_status" AS ENUM('pending', 'accepted', 'rejected', 'spam', 'confirmed_spam', 'failed');
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'recordAtlasSnapshot', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'recoverLostJobs', 'screenSubmission', 'sendPostEventFollowUps', 'sendDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  CREATE TYPE "public"."enum_payload_jobs_log_state" AS ENUM('failed', 'succeeded');
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'recordAtlasSnapshot', 'cleanupOrphanedMedia', 'deliverSubmission', 'expireEvents', 'recoverLostJobs', 'screenSubmission', 'sendPostEventFollowUps', 'sendDigests', 'sendSessionReminders', 'cleanupCollections', 'syncLectureMetadata', 'transcribeMeditation', 'verifyEmbeds', 'importEvents', 'resetUsage', 'sendInvitations', 'schedulePublish');
  CREATE TYPE "public"."enum_wm_web_config_available_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_wm_web_translations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__wm_web_translations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum__wm_web_translations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_wm_app_config_available_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_wm_app_config_vibe_check_tracks_identifier" AS ENUM('WHAT-YOU-FEEL-START', 'WHAT-YOU-FEEL-LEFT', 'WHAT-YOU-FEEL-RIGHT', 'INTRO-INTERPRET', 'BH-COOL', 'SOMETHING-NO-COOL', 'SOMETHING-COOL', 'BH-NOTHING');
  CREATE TYPE "public"."enum_wm_app_translations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__wm_app_translations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum__wm_app_translations_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_wm_app_status_baseline_country" AS ENUM('AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR', 'IO', 'BN', 'BG', 'BF', 'BI', 'KH', 'CM', 'CA', 'CV', 'KY', 'CF', 'TD', 'CL', 'CN', 'CX', 'CC', 'CO', 'KM', 'CG', 'CD', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF', 'GA', 'GM', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY', 'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IM', 'IL', 'IT', 'JM', 'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'XK', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MO', 'MK', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI', 'NE', 'NG', 'NU', 'NF', 'MP', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PN', 'PL', 'PT', 'PR', 'QA', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS', 'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TK', 'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UM', 'UY', 'UZ', 'VU', 'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW');
  CREATE TYPE "public"."enum_sy_atlas_config_available_locales" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum_sy_atlas_translations_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__sy_atlas_translations_v_published_locale" AS ENUM('en', 'es', 'de', 'it', 'fr', 'ru', 'ro', 'cs', 'uk', 'el', 'hy', 'pl', 'pt-BR', 'fa', 'bg', 'tr', 'en-AU', 'hu', 'nl');
  CREATE TYPE "public"."enum__sy_atlas_translations_v_version_status" AS ENUM('draft', 'published');
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
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar,
  	"content" jsonb,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"_status" "enum_pages_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
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
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
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
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  	"version_prefix" varchar DEFAULT '',
  	"version__objectkey" varchar,
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
  
  CREATE TABLE "transcripts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"audio_filename" varchar,
  	"provider" "enum_transcripts_provider",
  	"segments" jsonb,
  	"segment_count" numeric,
  	"job_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "transcripts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"meditations_id" integer,
  	"files_id" integer
  );
  
  CREATE TABLE "songs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"album_id" integer NOT NULL,
  	"include_for_meditations" boolean DEFAULT true,
  	"file_metadata" jsonb DEFAULT '{}'::jsonb,
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  	"tags" "enum_videos_tags" NOT NULL,
  	"file_metadata" jsonb DEFAULT '{}'::jsonb,
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  	"subtitles" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "lessons_panels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"media_id" integer
  );
  
  CREATE TABLE "lessons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"unit" "enum_lessons_unit" NOT NULL,
  	"step" numeric NOT NULL,
  	"icon_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "lessons_locales" (
  	"title" varchar,
  	"pre_meditation_lines" varchar,
  	"intro_audio_id" integer,
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
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  	"file_metadata" jsonb DEFAULT '{}'::jsonb,
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  	"spoken_language" "enum_files_spoken_language",
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  	"prefix" varchar DEFAULT '',
  	"_objectkey" varchar,
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
  
  CREATE TABLE "managers_contact_details" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_managers_contact_details_platform" NOT NULL,
  	"identifier" varchar NOT NULL,
  	"verified" boolean
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
  	"language" "enum_managers_language",
  	"notification_preferences" jsonb DEFAULT '{"invitation":{"frequency":"Immediate","method":"email"},"event_verification":{"frequency":"Monthly","method":"email"},"event_registration":{"frequency":"Daily","method":"email"},"new_proposals":{"frequency":"Daily","method":"email"},"open_items":{"frequency":"Monthly","method":"email"},"refused_signups":{"frequency":"Daily","method":"email"},"statistics":{"frequency":"Monthly","method":"email"}}'::jsonb,
  	"digest_watermarks" jsonb,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"magic_link_issued_at" timestamp(3) with time zone,
  	"last_login_at" timestamp(3) with time zone,
  	"pending_invitation" jsonb,
  	"invitation_due_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"_verified" boolean,
  	"_verificationtoken" varchar
  );
  
  CREATE TABLE "clients_roles" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_clients_roles",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"enabled" boolean DEFAULT false,
  	"notes" varchar,
  	"primary_contact_id" integer,
  	"region_id" integer,
  	"title" varchar,
  	"support_email" varchar,
  	"logo_id" integer,
  	"color1" varchar,
  	"color2" varchar,
  	"color3" varchar,
  	"mailing_list_provider" "enum_clients_mailing_list_provider",
  	"mailing_list_client_id" varchar,
  	"mailing_list_list_id" varchar,
  	"mailing_list_api_key" varchar,
  	"mailing_list_double_opt_in" boolean DEFAULT true,
  	"mailing_list_doi_flow_id" varchar,
  	"usage_daily_requests" numeric DEFAULT 0,
  	"usage_peak_daily_requests" numeric DEFAULT 0,
  	"usage_last_request_at" timestamp(3) with time zone,
  	"usage_total_requests" numeric DEFAULT 0,
  	"usage_high_usage_days" numeric DEFAULT 0,
  	"usage_last_high_usage_at" timestamp(3) with time zone,
  	"usage_first_request_at" timestamp(3) with time zone,
  	"canonical_owned" boolean DEFAULT false,
  	"canonical_verification" jsonb,
  	"canonical_next_verify_at" timestamp(3) with time zone,
  	"embed_metadata" jsonb,
  	"site_domain" varchar,
  	"site_page" varchar,
  	"site_track" "enum_clients_site_track",
  	"site_embed_height" "enum_clients_site_embed_height",
  	"language" "enum_clients_language",
  	"client_id" varchar,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
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
  	"default_page_id" integer,
  	"default_lecture_id" integer,
  	"default_album_id" integer,
  	"default_image_id" integer,
  	"default_aspect_ratio" "enum_app_cards_default_aspect_ratio" DEFAULT 'square',
  	"default_text_color" "enum_app_cards_default_text_color" DEFAULT 'black',
  	"default_alignment" "enum_app_cards_default_alignment" DEFAULT 'center',
  	"starting_soon_enabled" boolean DEFAULT false,
  	"starting_soon_threshold" varchar DEFAULT '1:00',
  	"starting_soon_button_icon_id" integer,
  	"starting_soon_page_id" integer,
  	"starting_soon_lecture_id" integer,
  	"starting_soon_album_id" integer,
  	"starting_soon_image_id" integer,
  	"starting_soon_aspect_ratio" "enum_app_cards_starting_soon_aspect_ratio" DEFAULT 'square',
  	"starting_soon_text_color" "enum_app_cards_starting_soon_text_color" DEFAULT 'black',
  	"starting_soon_alignment" "enum_app_cards_starting_soon_alignment" DEFAULT 'center',
  	"live_now_enabled" boolean DEFAULT false,
  	"live_now_threshold" varchar DEFAULT '0:00',
  	"live_now_button_icon_id" integer,
  	"live_now_page_id" integer,
  	"live_now_lecture_id" integer,
  	"live_now_album_id" integer,
  	"live_now_image_id" integer,
  	"live_now_aspect_ratio" "enum_app_cards_live_now_aspect_ratio" DEFAULT 'square',
  	"live_now_text_color" "enum_app_cards_live_now_text_color" DEFAULT 'black',
  	"live_now_alignment" "enum_app_cards_live_now_alignment" DEFAULT 'center',
  	"schedule_first_date" timestamp(3) with time zone,
  	"schedule_firstdate_tz" "enum_app_cards_schedule_firstdate_tz",
  	"schedule_end_time" varchar,
  	"schedule_recurrence_type" "enum_app_cards_schedule_recurrence_type",
  	"schedule_interval" numeric DEFAULT 1,
  	"schedule_last_date" timestamp(3) with time zone,
  	"weight" numeric DEFAULT 3,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "app_cards_locales" (
  	"default_header" varchar,
  	"default_title" varchar,
  	"default_subtitle" varchar,
  	"default_button_text" varchar,
  	"default_destination" "enum_app_cards_default_destination",
  	"default_meditation_id" integer,
  	"default_url" varchar,
  	"starting_soon_header" varchar,
  	"starting_soon_title" varchar,
  	"starting_soon_subtitle" varchar,
  	"starting_soon_button_text" varchar,
  	"starting_soon_destination" "enum_app_cards_starting_soon_destination",
  	"starting_soon_meditation_id" integer,
  	"starting_soon_url" varchar,
  	"live_now_header" varchar,
  	"live_now_title" varchar,
  	"live_now_subtitle" varchar,
  	"live_now_button_text" varchar,
  	"live_now_destination" "enum_app_cards_live_now_destination",
  	"live_now_meditation_id" integer,
  	"live_now_url" varchar,
  	"_status" "enum_app_cards_status" DEFAULT 'draft',
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
  	"version_default_page_id" integer,
  	"version_default_lecture_id" integer,
  	"version_default_album_id" integer,
  	"version_default_image_id" integer,
  	"version_default_aspect_ratio" "enum__app_cards_v_version_default_aspect_ratio" DEFAULT 'square',
  	"version_default_text_color" "enum__app_cards_v_version_default_text_color" DEFAULT 'black',
  	"version_default_alignment" "enum__app_cards_v_version_default_alignment" DEFAULT 'center',
  	"version_starting_soon_enabled" boolean DEFAULT false,
  	"version_starting_soon_threshold" varchar DEFAULT '1:00',
  	"version_starting_soon_button_icon_id" integer,
  	"version_starting_soon_page_id" integer,
  	"version_starting_soon_lecture_id" integer,
  	"version_starting_soon_album_id" integer,
  	"version_starting_soon_image_id" integer,
  	"version_starting_soon_aspect_ratio" "enum__app_cards_v_version_starting_soon_aspect_ratio" DEFAULT 'square',
  	"version_starting_soon_text_color" "enum__app_cards_v_version_starting_soon_text_color" DEFAULT 'black',
  	"version_starting_soon_alignment" "enum__app_cards_v_version_starting_soon_alignment" DEFAULT 'center',
  	"version_live_now_enabled" boolean DEFAULT false,
  	"version_live_now_threshold" varchar DEFAULT '0:00',
  	"version_live_now_button_icon_id" integer,
  	"version_live_now_page_id" integer,
  	"version_live_now_lecture_id" integer,
  	"version_live_now_album_id" integer,
  	"version_live_now_image_id" integer,
  	"version_live_now_aspect_ratio" "enum__app_cards_v_version_live_now_aspect_ratio" DEFAULT 'square',
  	"version_live_now_text_color" "enum__app_cards_v_version_live_now_text_color" DEFAULT 'black',
  	"version_live_now_alignment" "enum__app_cards_v_version_live_now_alignment" DEFAULT 'center',
  	"version_schedule_first_date" timestamp(3) with time zone,
  	"version_schedule_firstdate_tz" "enum__app_cards_v_version_schedule_firstdate_tz",
  	"version_schedule_end_time" varchar,
  	"version_schedule_recurrence_type" "enum__app_cards_v_version_schedule_recurrence_type",
  	"version_schedule_interval" numeric DEFAULT 1,
  	"version_schedule_last_date" timestamp(3) with time zone,
  	"version_weight" numeric DEFAULT 3,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
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
  	"version_default_destination" "enum__app_cards_v_version_default_destination",
  	"version_default_meditation_id" integer,
  	"version_default_url" varchar,
  	"version_starting_soon_header" varchar,
  	"version_starting_soon_title" varchar,
  	"version_starting_soon_subtitle" varchar,
  	"version_starting_soon_button_text" varchar,
  	"version_starting_soon_destination" "enum__app_cards_v_version_starting_soon_destination",
  	"version_starting_soon_meditation_id" integer,
  	"version_starting_soon_url" varchar,
  	"version_live_now_header" varchar,
  	"version_live_now_title" varchar,
  	"version_live_now_subtitle" varchar,
  	"version_live_now_button_text" varchar,
  	"version_live_now_destination" "enum__app_cards_v_version_live_now_destination",
  	"version_live_now_meditation_id" integer,
  	"version_live_now_url" varchar,
  	"version__status" "enum__app_cards_v_version_status" DEFAULT 'draft',
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
  
  CREATE TABLE "regions_breadcrumbs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"doc_id" integer,
  	"url" varchar,
  	"label" varchar
  );
  
  CREATE TABLE "regions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"level" "enum_regions_level" DEFAULT 'country' NOT NULL,
  	"parent_id" integer,
  	"mapbox_id" varchar NOT NULL,
  	"name" varchar,
  	"subtitle" varchar,
  	"latitude" numeric,
  	"longitude" numeric,
  	"radius" numeric,
  	"generate_slug" boolean DEFAULT false,
  	"slug" varchar NOT NULL,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "regions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"managers_id" integer
  );
  
  CREATE TABLE "events_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_events_languages",
  	"id" serial PRIMARY KEY NOT NULL
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
  
  CREATE TABLE "events_activity_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" varchar,
  	"type" varchar,
  	"key" varchar,
  	"cells" jsonb,
  	"data" jsonb
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"import_batch_id" integer,
  	"title" varchar,
  	"contact_phone" varchar,
  	"contact_email" varchar,
  	"contact_name" varchar,
  	"description" jsonb,
  	"website" varchar,
  	"region_id" integer,
  	"event_type" "enum_events_event_type" DEFAULT 'offline',
  	"online_url" varchar,
  	"address_mapbox_id" varchar,
  	"address_venue_name" varchar,
  	"address_street" varchar,
  	"address_room" varchar,
  	"address_post_code" varchar,
  	"address_country" varchar,
  	"address_region" varchar,
  	"address_city" varchar,
  	"address_latitude" numeric,
  	"address_longitude" numeric,
  	"inactive" boolean DEFAULT false,
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
  	"schedule_last_date" timestamp(3) with time zone,
  	"registration_mode" "enum_events_registration_mode" DEFAULT 'sahaj-atlas',
  	"external_registration_url" varchar,
  	"registration_limit" numeric,
  	"registration_notification_email" varchar,
  	"registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate',
  	"registration_questions_experience" boolean,
  	"registration_questions_referral" boolean,
  	"registration_questions_aspirations" boolean,
  	"registration_questions_questions" boolean,
  	"manager_id" integer,
  	"verification_stage" "enum_events_verification_stage" DEFAULT 'verified',
  	"confidence_score" numeric,
  	"submitter_id" integer,
  	"next_check_at" timestamp(3) with time zone,
  	"registrations_full" boolean DEFAULT false,
  	"quality_open_count" numeric,
  	"quality_check_version" numeric,
  	"system_meta" jsonb,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "enum_events_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"images_id" integer
  );
  
  CREATE TABLE "_events_v_version_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__events_v_version_languages",
  	"id" serial PRIMARY KEY NOT NULL
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
  
  CREATE TABLE "_events_v_version_activity_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"at" varchar,
  	"type" varchar,
  	"key" varchar,
  	"cells" jsonb,
  	"data" jsonb,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_events_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_import_batch_id" integer,
  	"version_title" varchar,
  	"version_contact_phone" varchar,
  	"version_contact_email" varchar,
  	"version_contact_name" varchar,
  	"version_description" jsonb,
  	"version_website" varchar,
  	"version_region_id" integer,
  	"version_event_type" "enum__events_v_version_event_type" DEFAULT 'offline',
  	"version_online_url" varchar,
  	"version_address_mapbox_id" varchar,
  	"version_address_venue_name" varchar,
  	"version_address_street" varchar,
  	"version_address_room" varchar,
  	"version_address_post_code" varchar,
  	"version_address_country" varchar,
  	"version_address_region" varchar,
  	"version_address_city" varchar,
  	"version_address_latitude" numeric,
  	"version_address_longitude" numeric,
  	"version_inactive" boolean DEFAULT false,
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
  	"version_schedule_last_date" timestamp(3) with time zone,
  	"version_registration_mode" "enum__events_v_version_registration_mode" DEFAULT 'sahaj-atlas',
  	"version_external_registration_url" varchar,
  	"version_registration_limit" numeric,
  	"version_registration_notification_email" varchar,
  	"version_registration_notification_frequency" "enum_events_registration_notification_frequency" DEFAULT 'Immediate',
  	"version_registration_questions_experience" boolean,
  	"version_registration_questions_referral" boolean,
  	"version_registration_questions_aspirations" boolean,
  	"version_registration_questions_questions" boolean,
  	"version_manager_id" integer,
  	"version_verification_stage" "enum_events_verification_stage" DEFAULT 'verified',
  	"version_confidence_score" numeric,
  	"version_submitter_id" integer,
  	"version_next_check_at" timestamp(3) with time zone,
  	"version_registrations_full" boolean DEFAULT false,
  	"version_quality_open_count" numeric,
  	"version_quality_check_version" numeric,
  	"version_system_meta" jsonb,
  	"version_legacy_id" numeric,
  	"version_legacy_data" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "enum__events_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__events_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_events_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"images_id" integer
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"blocked_at" timestamp(3) with time zone,
  	"blocked_reason" varchar,
  	"legacy_id" numeric,
  	"legacy_data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "imports_default_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_imports_default_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target_region_id" integer,
  	"error" varchar,
  	"results" jsonb,
  	"rows" jsonb,
  	"status" "enum_imports_status" DEFAULT 'pending',
  	"manager_id" integer,
  	"upload_locale" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
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
  	"required" boolean,
  	"block_name" varchar
  );
  
  CREATE TABLE "forms_blocks_select_locales" (
  	"label" varchar,
  	"default_value" varchar,
  	"placeholder" varchar,
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
  
  CREATE TABLE "forms" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"confirmation_type" "enum_forms_confirmation_type" DEFAULT 'message',
  	"action_type" "enum_forms_action_type" DEFAULT 'contact' NOT NULL,
  	"recipient_id" integer,
  	"client_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "forms_locales" (
  	"title" varchar,
  	"submit_button_label" varchar,
  	"confirmation_message" jsonb,
  	"redirect_url" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "user_submissions_submission_data" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "user_submissions_activity_log" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"at" varchar,
  	"type" varchar,
  	"key" varchar,
  	"cells" jsonb,
  	"data" jsonb
  );
  
  CREATE TABLE "user_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"screening_result" jsonb,
  	"starting_at" timestamp(3) with time zone,
  	"startingat_tz" "enum_user_submissions_startingat_tz",
  	"unsubscribed_at" timestamp(3) with time zone,
  	"event_feedback" "enum_user_submissions_event_feedback",
  	"manager_id" integer,
  	"region_id" integer,
  	"subject" varchar,
  	"type" "enum_user_submissions_type" DEFAULT 'contact' NOT NULL,
  	"status" "enum_user_submissions_status" DEFAULT 'pending' NOT NULL,
  	"user_id" integer,
  	"client_id" integer,
  	"form_id" integer,
  	"event_id" integer,
  	"uuid" varchar,
  	"location" jsonb,
  	"proposed" jsonb,
  	"routing_region_id" integer,
  	"follow_up_sent_at" timestamp(3) with time zone,
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
  	"concurrency_key" varchar,
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
  	"transcripts_id" integer,
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
  	"regions_id" integer,
  	"events_id" integer,
  	"users_id" integer,
  	"forms_id" integer,
  	"user_submissions_id" integer
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
  
  CREATE TABLE "wm_web_config_available_locales" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_wm_web_config_available_locales",
  	"id" serial PRIMARY KEY NOT NULL
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
  	"audiences_id" integer,
  	"pages_id" integer
  );
  
  CREATE TABLE "wm_web_translations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "wm_web_translations_locales" (
  	"common_general" jsonb,
  	"common_a11y" jsonb,
  	"navigation" jsonb,
  	"footer" jsonb,
  	"errors_general" jsonb,
  	"errors_a11y" jsonb,
  	"discover_general" jsonb,
  	"article_general" jsonb,
  	"article_a11y" jsonb,
  	"meditation_general" jsonb,
  	"meditation_a11y" jsonb,
  	"lecture_general" jsonb,
  	"lecture_a11y" jsonb,
  	"map_general" jsonb,
  	"map_a11y" jsonb,
  	"forms_general" jsonb,
  	"forms_a11y" jsonb,
  	"media_general" jsonb,
  	"media_a11y" jsonb,
  	"video_general" jsonb,
  	"video_a11y" jsonb,
  	"location_general" jsonb,
  	"location_a11y" jsonb,
  	"blocks_general" jsonb,
  	"blocks_a11y" jsonb,
  	"_status" "enum_wm_web_translations_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_wm_web_translations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__wm_web_translations_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_wm_web_translations_v_locales" (
  	"version_common_general" jsonb,
  	"version_common_a11y" jsonb,
  	"version_navigation" jsonb,
  	"version_footer" jsonb,
  	"version_errors_general" jsonb,
  	"version_errors_a11y" jsonb,
  	"version_discover_general" jsonb,
  	"version_article_general" jsonb,
  	"version_article_a11y" jsonb,
  	"version_meditation_general" jsonb,
  	"version_meditation_a11y" jsonb,
  	"version_lecture_general" jsonb,
  	"version_lecture_a11y" jsonb,
  	"version_map_general" jsonb,
  	"version_map_a11y" jsonb,
  	"version_forms_general" jsonb,
  	"version_forms_a11y" jsonb,
  	"version_media_general" jsonb,
  	"version_media_a11y" jsonb,
  	"version_video_general" jsonb,
  	"version_video_a11y" jsonb,
  	"version_location_general" jsonb,
  	"version_location_a11y" jsonb,
  	"version_blocks_general" jsonb,
  	"version_blocks_a11y" jsonb,
  	"version__status" "enum__wm_web_translations_v_version_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "wm_app_config_available_locales" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_wm_app_config_available_locales",
  	"id" serial PRIMARY KEY NOT NULL
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
  	"profile_privacy" jsonb,
  	"profile_privacy_advertising_body_never_share" jsonb,
  	"profile_privacy_advertising_body_intro" jsonb,
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
  	"_status" "enum_wm_app_translations_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_wm_app_translations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
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
  	"version_profile_privacy" jsonb,
  	"version_profile_privacy_advertising_body_never_share" jsonb,
  	"version_profile_privacy_advertising_body_intro" jsonb,
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
  	"version__status" "enum__wm_app_translations_v_version_status" DEFAULT 'draft',
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
  
  CREATE TABLE "sy_atlas_config_available_locales" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_sy_atlas_config_available_locales",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "sy_atlas_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"canonical_fallback_client_id" integer,
  	"report_issue_form_id" integer,
  	"default_map_center_latitude" numeric DEFAULT 0 NOT NULL,
  	"default_map_center_longitude" numeric DEFAULT 0 NOT NULL,
  	"default_zoom_level" numeric DEFAULT 10,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "sy_atlas_translations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "sy_atlas_translations_locales" (
  	"common_chrome" jsonb,
  	"common_settings" jsonb,
  	"common_errors" jsonb,
  	"common_report" jsonb,
  	"common_report_errors" jsonb,
  	"common_map" jsonb,
  	"common_feedback" jsonb,
  	"countries" jsonb,
  	"search_chrome" jsonb,
  	"search_results" jsonb,
  	"search_sort" jsonb,
  	"search_country_site" jsonb,
  	"search_nearby_prompt" jsonb,
  	"filters_chrome" jsonb,
  	"filters_format" jsonb,
  	"filters_cadence" jsonb,
  	"filters_days" jsonb,
  	"filters_time" jsonb,
  	"filters_language" jsonb,
  	"filters_dates" jsonb,
  	"filters_region" jsonb,
  	"online" jsonb,
  	"event_display" jsonb,
  	"event_actions" jsonb,
  	"event_recurrence" jsonb,
  	"event_title" jsonb,
  	"calendar" jsonb,
  	"registration_form" jsonb,
  	"registration_errors" jsonb,
  	"registration_questions" jsonb,
  	"submit_chrome" jsonb,
  	"submit_where" jsonb,
  	"submit_when" jsonb,
  	"submit_contact" jsonb,
  	"submit_about" jsonb,
  	"submit_more" jsonb,
  	"submit_review" jsonb,
  	"submit_done" jsonb,
  	"submit_errors" jsonb,
  	"share" jsonb,
  	"compact" jsonb,
  	"seo" jsonb,
  	"emails" jsonb,
  	"_status" "enum_sy_atlas_translations_status" DEFAULT 'draft',
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_sy_atlas_translations_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"snapshot" boolean,
  	"published_locale" "enum__sy_atlas_translations_v_published_locale",
  	"latest" boolean
  );
  
  CREATE TABLE "_sy_atlas_translations_v_locales" (
  	"version_common_chrome" jsonb,
  	"version_common_settings" jsonb,
  	"version_common_errors" jsonb,
  	"version_common_report" jsonb,
  	"version_common_report_errors" jsonb,
  	"version_common_map" jsonb,
  	"version_common_feedback" jsonb,
  	"version_countries" jsonb,
  	"version_search_chrome" jsonb,
  	"version_search_results" jsonb,
  	"version_search_sort" jsonb,
  	"version_search_country_site" jsonb,
  	"version_search_nearby_prompt" jsonb,
  	"version_filters_chrome" jsonb,
  	"version_filters_format" jsonb,
  	"version_filters_cadence" jsonb,
  	"version_filters_days" jsonb,
  	"version_filters_time" jsonb,
  	"version_filters_language" jsonb,
  	"version_filters_dates" jsonb,
  	"version_filters_region" jsonb,
  	"version_online" jsonb,
  	"version_event_display" jsonb,
  	"version_event_actions" jsonb,
  	"version_event_recurrence" jsonb,
  	"version_event_title" jsonb,
  	"version_calendar" jsonb,
  	"version_registration_form" jsonb,
  	"version_registration_errors" jsonb,
  	"version_registration_questions" jsonb,
  	"version_submit_chrome" jsonb,
  	"version_submit_where" jsonb,
  	"version_submit_when" jsonb,
  	"version_submit_contact" jsonb,
  	"version_submit_about" jsonb,
  	"version_submit_more" jsonb,
  	"version_submit_review" jsonb,
  	"version_submit_done" jsonb,
  	"version_submit_errors" jsonb,
  	"version_share" jsonb,
  	"version_compact" jsonb,
  	"version_seo" jsonb,
  	"version_emails" jsonb,
  	"version__status" "enum__sy_atlas_translations_v_version_status" DEFAULT 'draft',
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
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_tags" ADD CONSTRAINT "_pages_v_version_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_author_id_authors_id_fk" FOREIGN KEY ("version_author_id") REFERENCES "public"."authors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_featured_video_id_videos_id_fk" FOREIGN KEY ("version_featured_video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_version_meta_image_id_images_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "meditations" ADD CONSTRAINT "meditations_narrator_id_narrators_id_fk" FOREIGN KEY ("narrator_id") REFERENCES "public"."narrators"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "meditations" ADD CONSTRAINT "meditations_song_tag_id_song_tags_id_fk" FOREIGN KEY ("song_tag_id") REFERENCES "public"."song_tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "meditations" ADD CONSTRAINT "meditations_thumbnail_id_images_id_fk" FOREIGN KEY ("thumbnail_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_parent_id_meditations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_version_narrator_id_narrators_id_fk" FOREIGN KEY ("version_narrator_id") REFERENCES "public"."narrators"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_version_song_tag_id_song_tags_id_fk" FOREIGN KEY ("version_song_tag_id") REFERENCES "public"."song_tags"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_meditations_v" ADD CONSTRAINT "_meditations_v_version_thumbnail_id_images_id_fk" FOREIGN KEY ("version_thumbnail_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_job_id_payload_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."payload_jobs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "transcripts_rels" ADD CONSTRAINT "transcripts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transcripts_rels" ADD CONSTRAINT "transcripts_rels_meditations_fk" FOREIGN KEY ("meditations_id") REFERENCES "public"."meditations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "transcripts_rels" ADD CONSTRAINT "transcripts_rels_files_fk" FOREIGN KEY ("files_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_icon_id_images_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lessons_locales" ADD CONSTRAINT "lessons_locales_intro_audio_id_files_id_fk" FOREIGN KEY ("intro_audio_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;
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
  ALTER TABLE "managers_contact_details" ADD CONSTRAINT "managers_contact_details_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "managers_sessions" ADD CONSTRAINT "managers_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "clients_roles" ADD CONSTRAINT "clients_roles_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_primary_contact_id_managers_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clients" ADD CONSTRAINT "clients_logo_id_images_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
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
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_image_id_images_id_fk" FOREIGN KEY ("default_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_button_icon_id_images_id_fk" FOREIGN KEY ("starting_soon_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_page_id_pages_id_fk" FOREIGN KEY ("starting_soon_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_lecture_id_lectures_id_fk" FOREIGN KEY ("starting_soon_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_album_id_albums_id_fk" FOREIGN KEY ("starting_soon_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_image_id_images_id_fk" FOREIGN KEY ("starting_soon_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_button_icon_id_images_id_fk" FOREIGN KEY ("live_now_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_page_id_pages_id_fk" FOREIGN KEY ("live_now_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_lecture_id_lectures_id_fk" FOREIGN KEY ("live_now_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_album_id_albums_id_fk" FOREIGN KEY ("live_now_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_image_id_images_id_fk" FOREIGN KEY ("live_now_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards_locales" ADD CONSTRAINT "app_cards_locales_default_meditation_id_meditations_id_fk" FOREIGN KEY ("default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards_locales" ADD CONSTRAINT "app_cards_locales_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards_locales" ADD CONSTRAINT "app_cards_locales_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
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
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_image_id_images_id_fk" FOREIGN KEY ("version_default_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_button_icon_id_images_id_fk" FOREIGN KEY ("version_starting_soon_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_page_id_pages_id_fk" FOREIGN KEY ("version_starting_soon_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_lecture_id_lectures_id_fk" FOREIGN KEY ("version_starting_soon_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_album_id_albums_id_fk" FOREIGN KEY ("version_starting_soon_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_image_id_images_id_fk" FOREIGN KEY ("version_starting_soon_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_button_icon_id_images_id_fk" FOREIGN KEY ("version_live_now_button_icon_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_page_id_pages_id_fk" FOREIGN KEY ("version_live_now_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_lecture_id_lectures_id_fk" FOREIGN KEY ("version_live_now_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_album_id_albums_id_fk" FOREIGN KEY ("version_live_now_album_id") REFERENCES "public"."albums"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_image_id_images_id_fk" FOREIGN KEY ("version_live_now_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_version_default_meditation_id_meditations_id_fk" FOREIGN KEY ("version_default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_version_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("version_starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_version_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("version_live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_rels" ADD CONSTRAINT "_app_cards_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_app_cards_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_app_cards_v_rels" ADD CONSTRAINT "_app_cards_v_rels_audiences_fk" FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "regions_breadcrumbs" ADD CONSTRAINT "regions_breadcrumbs_doc_id_regions_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "regions_breadcrumbs" ADD CONSTRAINT "regions_breadcrumbs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "regions" ADD CONSTRAINT "regions_parent_id_regions_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "regions_rels" ADD CONSTRAINT "regions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "regions_rels" ADD CONSTRAINT "regions_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_languages" ADD CONSTRAINT "events_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_schedule_weekdays" ADD CONSTRAINT "events_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_schedule_exclusions" ADD CONSTRAINT "events_schedule_exclusions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_activity_log" ADD CONSTRAINT "events_activity_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_import_batch_id_imports_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_submitter_id_users_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_images_fk" FOREIGN KEY ("images_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_languages" ADD CONSTRAINT "_events_v_version_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_schedule_weekdays" ADD CONSTRAINT "_events_v_version_schedule_weekdays_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_schedule_exclusions" ADD CONSTRAINT "_events_v_version_schedule_exclusions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_activity_log" ADD CONSTRAINT "_events_v_version_activity_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_parent_id_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_import_batch_id_imports_id_fk" FOREIGN KEY ("version_import_batch_id") REFERENCES "public"."imports"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_region_id_regions_id_fk" FOREIGN KEY ("version_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_manager_id_managers_id_fk" FOREIGN KEY ("version_manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_submitter_id_users_id_fk" FOREIGN KEY ("version_submitter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_images_fk" FOREIGN KEY ("images_id") REFERENCES "public"."images"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "imports_default_languages" ADD CONSTRAINT "imports_default_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "imports" ADD CONSTRAINT "imports_target_region_id_regions_id_fk" FOREIGN KEY ("target_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "imports" ADD CONSTRAINT "imports_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
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
  ALTER TABLE "forms" ADD CONSTRAINT "forms_recipient_id_managers_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forms" ADD CONSTRAINT "forms_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "forms_locales" ADD CONSTRAINT "forms_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_submissions_submission_data" ADD CONSTRAINT "user_submissions_submission_data_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."user_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_submissions_activity_log" ADD CONSTRAINT "user_submissions_activity_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."user_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_manager_id_managers_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."managers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_submissions" ADD CONSTRAINT "user_submissions_routing_region_id_regions_id_fk" FOREIGN KEY ("routing_region_id") REFERENCES "public"."regions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_jobs_log" ADD CONSTRAINT "payload_jobs_log_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."payload_jobs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_meditations_fk" FOREIGN KEY ("meditations_id") REFERENCES "public"."meditations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_transcripts_fk" FOREIGN KEY ("transcripts_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_regions_fk" FOREIGN KEY ("regions_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_forms_fk" FOREIGN KEY ("forms_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_submissions_fk" FOREIGN KEY ("user_submissions_id") REFERENCES "public"."user_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_managers_fk" FOREIGN KEY ("managers_id") REFERENCES "public"."managers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_clients_fk" FOREIGN KEY ("clients_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_config_available_locales" ADD CONSTRAINT "wm_web_config_available_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_web_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_config" ADD CONSTRAINT "wm_web_config_home_page_id_pages_id_fk" FOREIGN KEY ("home_page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "wm_web_config_rels" ADD CONSTRAINT "wm_web_config_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_web_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_config_rels" ADD CONSTRAINT "wm_web_config_rels_audiences_fk" FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_config_rels" ADD CONSTRAINT "wm_web_config_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_web_translations_locales" ADD CONSTRAINT "wm_web_translations_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."wm_web_translations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_wm_web_translations_v_locales" ADD CONSTRAINT "_wm_web_translations_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_wm_web_translations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "wm_app_config_available_locales" ADD CONSTRAINT "wm_app_config_available_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."wm_app_config"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "sy_atlas_config_available_locales" ADD CONSTRAINT "sy_atlas_config_available_locales_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sy_atlas_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sy_atlas_config" ADD CONSTRAINT "sy_atlas_config_canonical_fallback_client_id_clients_id_fk" FOREIGN KEY ("canonical_fallback_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sy_atlas_config" ADD CONSTRAINT "sy_atlas_config_report_issue_form_id_forms_id_fk" FOREIGN KEY ("report_issue_form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
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
  CREATE INDEX "pages_meta_meta_image_idx" ON "pages_locales" USING btree ("meta_image_id","_locale");
  CREATE INDEX "pages__status_idx" ON "pages_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_locales_parent_id_idx" ON "pages_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_rels_order_idx" ON "pages_rels" USING btree ("order");
  CREATE INDEX "pages_rels_parent_idx" ON "pages_rels" USING btree ("parent_id");
  CREATE INDEX "pages_rels_path_idx" ON "pages_rels" USING btree ("path");
  CREATE INDEX "pages_rels_managers_id_idx" ON "pages_rels" USING btree ("managers_id");
  CREATE INDEX "_pages_v_version_tags_order_idx" ON "_pages_v_version_tags" USING btree ("order");
  CREATE INDEX "_pages_v_version_tags_parent_idx" ON "_pages_v_version_tags" USING btree ("parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_author_idx" ON "_pages_v" USING btree ("version_author_id");
  CREATE INDEX "_pages_v_version_version_featured_video_idx" ON "_pages_v" USING btree ("version_featured_video_id");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "_pages_v" USING btree ("version_deleted_at");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_snapshot_idx" ON "_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "_pages_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX "_pages_v_version_meta_version_meta_image_idx" ON "_pages_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_locales_parent_id_idx" ON "_pages_v_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_rels_order_idx" ON "_pages_v_rels" USING btree ("order");
  CREATE INDEX "_pages_v_rels_parent_idx" ON "_pages_v_rels" USING btree ("parent_id");
  CREATE INDEX "_pages_v_rels_path_idx" ON "_pages_v_rels" USING btree ("path");
  CREATE INDEX "_pages_v_rels_managers_id_idx" ON "_pages_v_rels" USING btree ("managers_id");
  CREATE INDEX "meditations_locale_idx" ON "meditations" USING btree ("locale");
  CREATE INDEX "meditations_narrator_idx" ON "meditations" USING btree ("narrator_id");
  CREATE INDEX "meditations_song_tag_idx" ON "meditations" USING btree ("song_tag_id");
  CREATE INDEX "meditations_thumbnail_idx" ON "meditations" USING btree ("thumbnail_id");
  CREATE INDEX "meditations_updated_at_idx" ON "meditations" USING btree ("updated_at");
  CREATE INDEX "meditations_created_at_idx" ON "meditations" USING btree ("created_at");
  CREATE INDEX "meditations_deleted_at_idx" ON "meditations" USING btree ("deleted_at");
  CREATE INDEX "meditations__status_idx" ON "meditations" USING btree ("_status");
  CREATE UNIQUE INDEX "meditations_filename_idx" ON "meditations" USING btree ("filename");
  CREATE INDEX "_meditations_v_parent_idx" ON "_meditations_v" USING btree ("parent_id");
  CREATE INDEX "_meditations_v_version_version_locale_idx" ON "_meditations_v" USING btree ("version_locale");
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
  CREATE INDEX "transcripts_job_idx" ON "transcripts" USING btree ("job_id");
  CREATE INDEX "transcripts_updated_at_idx" ON "transcripts" USING btree ("updated_at");
  CREATE INDEX "transcripts_created_at_idx" ON "transcripts" USING btree ("created_at");
  CREATE INDEX "transcripts_rels_order_idx" ON "transcripts_rels" USING btree ("order");
  CREATE INDEX "transcripts_rels_parent_idx" ON "transcripts_rels" USING btree ("parent_id");
  CREATE INDEX "transcripts_rels_path_idx" ON "transcripts_rels" USING btree ("path");
  CREATE UNIQUE INDEX "transcripts_rels_meditations_id_idx" ON "transcripts_rels" USING btree ("meditations_id","path");
  CREATE UNIQUE INDEX "transcripts_rels_files_id_idx" ON "transcripts_rels" USING btree ("files_id","path");
  CREATE INDEX "songs_album_idx" ON "songs" USING btree ("album_id");
  CREATE INDEX "songs_updated_at_idx" ON "songs" USING btree ("updated_at");
  CREATE INDEX "songs_created_at_idx" ON "songs" USING btree ("created_at");
  CREATE INDEX "songs_deleted_at_idx" ON "songs" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "songs_filename_idx" ON "songs" USING btree ("filename");
  CREATE UNIQUE INDEX "songs_locales_locale_parent_id_unique" ON "songs_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "songs_locales_parent_id_idx" ON "songs_locales" USING btree ("_parent_id");
  CREATE INDEX "songs_rels_order_idx" ON "songs_rels" USING btree ("order");
  CREATE INDEX "songs_rels_parent_idx" ON "songs_rels" USING btree ("parent_id");
  CREATE INDEX "songs_rels_path_idx" ON "songs_rels" USING btree ("path");
  CREATE INDEX "songs_rels_song_tags_id_idx" ON "songs_rels" USING btree ("song_tags_id");
  CREATE INDEX "albums_artwork_idx" ON "albums" USING btree ("artwork_id");
  CREATE INDEX "albums_updated_at_idx" ON "albums" USING btree ("updated_at");
  CREATE INDEX "albums_created_at_idx" ON "albums" USING btree ("created_at");
  CREATE INDEX "albums_deleted_at_idx" ON "albums" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "albums_locales_locale_parent_id_unique" ON "albums_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "albums_locales_parent_id_idx" ON "albums_locales" USING btree ("_parent_id");
  CREATE INDEX "videos_thumbnail_idx" ON "videos" USING btree ("thumbnail_id");
  CREATE INDEX "videos_updated_at_idx" ON "videos" USING btree ("updated_at");
  CREATE INDEX "videos_created_at_idx" ON "videos" USING btree ("created_at");
  CREATE UNIQUE INDEX "videos_filename_idx" ON "videos" USING btree ("filename");
  CREATE UNIQUE INDEX "videos_locales_locale_parent_id_unique" ON "videos_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "videos_locales_parent_id_idx" ON "videos_locales" USING btree ("_parent_id");
  CREATE INDEX "lessons_panels_order_idx" ON "lessons_panels" USING btree ("_order");
  CREATE INDEX "lessons_panels_parent_id_idx" ON "lessons_panels" USING btree ("_parent_id");
  CREATE INDEX "lessons_panels_locale_idx" ON "lessons_panels" USING btree ("_locale");
  CREATE INDEX "lessons_panels_media_idx" ON "lessons_panels" USING btree ("media_id");
  CREATE INDEX "lessons_icon_idx" ON "lessons" USING btree ("icon_id");
  CREATE INDEX "lessons_updated_at_idx" ON "lessons" USING btree ("updated_at");
  CREATE INDEX "lessons_created_at_idx" ON "lessons" USING btree ("created_at");
  CREATE INDEX "lessons_deleted_at_idx" ON "lessons" USING btree ("deleted_at");
  CREATE INDEX "lessons_intro_audio_idx" ON "lessons_locales" USING btree ("intro_audio_id","_locale");
  CREATE UNIQUE INDEX "lessons_locales_locale_parent_id_unique" ON "lessons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "lessons_locales_parent_id_idx" ON "lessons_locales" USING btree ("_parent_id");
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
  CREATE INDEX "lectures_locales_parent_id_idx" ON "lectures_locales" USING btree ("_parent_id");
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
  CREATE INDEX "authors_locales_parent_id_idx" ON "authors_locales" USING btree ("_parent_id");
  CREATE INDEX "images_tags_order_idx" ON "images_tags" USING btree ("order");
  CREATE INDEX "images_tags_parent_idx" ON "images_tags" USING btree ("parent_id");
  CREATE INDEX "images_updated_at_idx" ON "images" USING btree ("updated_at");
  CREATE INDEX "images_created_at_idx" ON "images" USING btree ("created_at");
  CREATE INDEX "images_deleted_at_idx" ON "images" USING btree ("deleted_at");
  CREATE UNIQUE INDEX "images_filename_idx" ON "images" USING btree ("filename");
  CREATE UNIQUE INDEX "images_locales_locale_parent_id_unique" ON "images_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "images_locales_parent_id_idx" ON "images_locales" USING btree ("_parent_id");
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
  CREATE INDEX "user_choices_locales_parent_id_idx" ON "user_choices_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "subtle_system_nodes_slug_idx" ON "subtle_system_nodes" USING btree ("slug");
  CREATE INDEX "subtle_system_nodes_page_idx" ON "subtle_system_nodes" USING btree ("page_id");
  CREATE INDEX "subtle_system_nodes_updated_at_idx" ON "subtle_system_nodes" USING btree ("updated_at");
  CREATE INDEX "subtle_system_nodes_created_at_idx" ON "subtle_system_nodes" USING btree ("created_at");
  CREATE UNIQUE INDEX "song_tags_slug_idx" ON "song_tags" USING btree ("slug");
  CREATE INDEX "song_tags_updated_at_idx" ON "song_tags" USING btree ("updated_at");
  CREATE INDEX "song_tags_created_at_idx" ON "song_tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "song_tags_filename_idx" ON "song_tags" USING btree ("filename");
  CREATE UNIQUE INDEX "song_tags_locales_locale_parent_id_unique" ON "song_tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "song_tags_locales_parent_id_idx" ON "song_tags_locales" USING btree ("_parent_id");
  CREATE INDEX "managers_roles_order_idx" ON "managers_roles" USING btree ("order");
  CREATE INDEX "managers_roles_parent_idx" ON "managers_roles" USING btree ("parent_id");
  CREATE INDEX "managers_roles_locale_idx" ON "managers_roles" USING btree ("locale");
  CREATE INDEX "managers_contact_details_order_idx" ON "managers_contact_details" USING btree ("_order");
  CREATE INDEX "managers_contact_details_parent_id_idx" ON "managers_contact_details" USING btree ("_parent_id");
  CREATE INDEX "managers_sessions_order_idx" ON "managers_sessions" USING btree ("_order");
  CREATE INDEX "managers_sessions_parent_id_idx" ON "managers_sessions" USING btree ("_parent_id");
  CREATE INDEX "managers_legacy_id_idx" ON "managers" USING btree ("legacy_id");
  CREATE INDEX "managers_invitation_due_at_idx" ON "managers" USING btree ("invitation_due_at");
  CREATE INDEX "managers_updated_at_idx" ON "managers" USING btree ("updated_at");
  CREATE INDEX "managers_created_at_idx" ON "managers" USING btree ("created_at");
  CREATE UNIQUE INDEX "managers_email_idx" ON "managers" USING btree ("email");
  CREATE INDEX "clients_roles_order_idx" ON "clients_roles" USING btree ("order");
  CREATE INDEX "clients_roles_parent_idx" ON "clients_roles" USING btree ("parent_id");
  CREATE INDEX "clients_enabled_idx" ON "clients" USING btree ("enabled");
  CREATE INDEX "clients_primary_contact_idx" ON "clients" USING btree ("primary_contact_id");
  CREATE INDEX "clients_region_idx" ON "clients" USING btree ("region_id");
  CREATE INDEX "clients_logo_idx" ON "clients" USING btree ("logo_id");
  CREATE INDEX "clients_canonical_canonical_owned_idx" ON "clients" USING btree ("canonical_owned");
  CREATE INDEX "clients_canonical_canonical_next_verify_at_idx" ON "clients" USING btree ("canonical_next_verify_at");
  CREATE INDEX "clients_legacy_id_idx" ON "clients" USING btree ("legacy_id");
  CREATE INDEX "clients_updated_at_idx" ON "clients" USING btree ("updated_at");
  CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");
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
  CREATE INDEX "app_cards_default_default_image_idx" ON "app_cards" USING btree ("default_image_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_button_icon_idx" ON "app_cards" USING btree ("starting_soon_button_icon_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_page_idx" ON "app_cards" USING btree ("starting_soon_page_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_lecture_idx" ON "app_cards" USING btree ("starting_soon_lecture_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_album_idx" ON "app_cards" USING btree ("starting_soon_album_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_image_idx" ON "app_cards" USING btree ("starting_soon_image_id");
  CREATE INDEX "app_cards_live_now_live_now_button_icon_idx" ON "app_cards" USING btree ("live_now_button_icon_id");
  CREATE INDEX "app_cards_live_now_live_now_page_idx" ON "app_cards" USING btree ("live_now_page_id");
  CREATE INDEX "app_cards_live_now_live_now_lecture_idx" ON "app_cards" USING btree ("live_now_lecture_id");
  CREATE INDEX "app_cards_live_now_live_now_album_idx" ON "app_cards" USING btree ("live_now_album_id");
  CREATE INDEX "app_cards_live_now_live_now_image_idx" ON "app_cards" USING btree ("live_now_image_id");
  CREATE INDEX "app_cards_schedule_schedule_last_date_idx" ON "app_cards" USING btree ("schedule_last_date");
  CREATE INDEX "app_cards_updated_at_idx" ON "app_cards" USING btree ("updated_at");
  CREATE INDEX "app_cards_created_at_idx" ON "app_cards" USING btree ("created_at");
  CREATE INDEX "app_cards_default_default_meditation_idx" ON "app_cards_locales" USING btree ("default_meditation_id","_locale");
  CREATE INDEX "app_cards_starting_soon_starting_soon_meditation_idx" ON "app_cards_locales" USING btree ("starting_soon_meditation_id","_locale");
  CREATE INDEX "app_cards_live_now_live_now_meditation_idx" ON "app_cards_locales" USING btree ("live_now_meditation_id","_locale");
  CREATE INDEX "app_cards__status_idx" ON "app_cards_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "app_cards_locales_locale_parent_id_unique" ON "app_cards_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "app_cards_locales_parent_id_idx" ON "app_cards_locales" USING btree ("_parent_id");
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
  CREATE INDEX "_app_cards_v_version_default_version_default_image_idx" ON "_app_cards_v" USING btree ("version_default_image_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_soon_idx" ON "_app_cards_v" USING btree ("version_starting_soon_button_icon_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_1_idx" ON "_app_cards_v" USING btree ("version_starting_soon_page_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_2_idx" ON "_app_cards_v" USING btree ("version_starting_soon_lecture_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_3_idx" ON "_app_cards_v" USING btree ("version_starting_soon_album_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_5_idx" ON "_app_cards_v" USING btree ("version_starting_soon_image_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_button_ic_idx" ON "_app_cards_v" USING btree ("version_live_now_button_icon_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_page_idx" ON "_app_cards_v" USING btree ("version_live_now_page_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_lecture_idx" ON "_app_cards_v" USING btree ("version_live_now_lecture_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_album_idx" ON "_app_cards_v" USING btree ("version_live_now_album_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_image_idx" ON "_app_cards_v" USING btree ("version_live_now_image_id");
  CREATE INDEX "_app_cards_v_version_schedule_version_schedule_last_date_idx" ON "_app_cards_v" USING btree ("version_schedule_last_date");
  CREATE INDEX "_app_cards_v_version_version_updated_at_idx" ON "_app_cards_v" USING btree ("version_updated_at");
  CREATE INDEX "_app_cards_v_version_version_created_at_idx" ON "_app_cards_v" USING btree ("version_created_at");
  CREATE INDEX "_app_cards_v_created_at_idx" ON "_app_cards_v" USING btree ("created_at");
  CREATE INDEX "_app_cards_v_updated_at_idx" ON "_app_cards_v" USING btree ("updated_at");
  CREATE INDEX "_app_cards_v_snapshot_idx" ON "_app_cards_v" USING btree ("snapshot");
  CREATE INDEX "_app_cards_v_published_locale_idx" ON "_app_cards_v" USING btree ("published_locale");
  CREATE INDEX "_app_cards_v_latest_idx" ON "_app_cards_v" USING btree ("latest");
  CREATE INDEX "_app_cards_v_version_default_version_default_meditation_idx" ON "_app_cards_v_locales" USING btree ("version_default_meditation_id","_locale");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_4_idx" ON "_app_cards_v_locales" USING btree ("version_starting_soon_meditation_id","_locale");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_meditatio_idx" ON "_app_cards_v_locales" USING btree ("version_live_now_meditation_id","_locale");
  CREATE INDEX "_app_cards_v_version_version__status_idx" ON "_app_cards_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_app_cards_v_locales_locale_parent_id_unique" ON "_app_cards_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_app_cards_v_locales_parent_id_idx" ON "_app_cards_v_locales" USING btree ("_parent_id");
  CREATE INDEX "_app_cards_v_rels_order_idx" ON "_app_cards_v_rels" USING btree ("order");
  CREATE INDEX "_app_cards_v_rels_parent_idx" ON "_app_cards_v_rels" USING btree ("parent_id");
  CREATE INDEX "_app_cards_v_rels_path_idx" ON "_app_cards_v_rels" USING btree ("path");
  CREATE INDEX "_app_cards_v_rels_audiences_id_idx" ON "_app_cards_v_rels" USING btree ("audiences_id");
  CREATE INDEX "regions_breadcrumbs_order_idx" ON "regions_breadcrumbs" USING btree ("_order");
  CREATE INDEX "regions_breadcrumbs_parent_id_idx" ON "regions_breadcrumbs" USING btree ("_parent_id");
  CREATE INDEX "regions_breadcrumbs_doc_idx" ON "regions_breadcrumbs" USING btree ("doc_id");
  CREATE INDEX "regions_parent_idx" ON "regions" USING btree ("parent_id");
  CREATE UNIQUE INDEX "regions_mapbox_id_idx" ON "regions" USING btree ("mapbox_id");
  CREATE UNIQUE INDEX "regions_slug_idx" ON "regions" USING btree ("slug");
  CREATE INDEX "regions_legacy_id_idx" ON "regions" USING btree ("legacy_id");
  CREATE INDEX "regions_updated_at_idx" ON "regions" USING btree ("updated_at");
  CREATE INDEX "regions_created_at_idx" ON "regions" USING btree ("created_at");
  CREATE INDEX "regions_rels_order_idx" ON "regions_rels" USING btree ("order");
  CREATE INDEX "regions_rels_parent_idx" ON "regions_rels" USING btree ("parent_id");
  CREATE INDEX "regions_rels_path_idx" ON "regions_rels" USING btree ("path");
  CREATE INDEX "regions_rels_managers_id_idx" ON "regions_rels" USING btree ("managers_id");
  CREATE INDEX "events_languages_order_idx" ON "events_languages" USING btree ("order");
  CREATE INDEX "events_languages_parent_idx" ON "events_languages" USING btree ("parent_id");
  CREATE INDEX "events_schedule_weekdays_order_idx" ON "events_schedule_weekdays" USING btree ("order");
  CREATE INDEX "events_schedule_weekdays_parent_idx" ON "events_schedule_weekdays" USING btree ("parent_id");
  CREATE INDEX "events_schedule_exclusions_order_idx" ON "events_schedule_exclusions" USING btree ("_order");
  CREATE INDEX "events_schedule_exclusions_parent_id_idx" ON "events_schedule_exclusions" USING btree ("_parent_id");
  CREATE INDEX "events_activity_log_order_idx" ON "events_activity_log" USING btree ("_order");
  CREATE INDEX "events_activity_log_parent_id_idx" ON "events_activity_log" USING btree ("_parent_id");
  CREATE INDEX "events_import_batch_idx" ON "events" USING btree ("import_batch_id");
  CREATE INDEX "events_region_idx" ON "events" USING btree ("region_id");
  CREATE INDEX "events_schedule_schedule_last_date_idx" ON "events" USING btree ("schedule_last_date");
  CREATE INDEX "events_manager_idx" ON "events" USING btree ("manager_id");
  CREATE INDEX "events_confidence_score_idx" ON "events" USING btree ("confidence_score");
  CREATE INDEX "events_submitter_idx" ON "events" USING btree ("submitter_id");
  CREATE INDEX "events_next_check_at_idx" ON "events" USING btree ("next_check_at");
  CREATE INDEX "events_quality_open_count_idx" ON "events" USING btree ("quality_open_count");
  CREATE INDEX "events_legacy_id_idx" ON "events" USING btree ("legacy_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "events_deleted_at_idx" ON "events" USING btree ("deleted_at");
  CREATE INDEX "events__status_idx" ON "events" USING btree ("_status");
  CREATE INDEX "events_rels_order_idx" ON "events_rels" USING btree ("order");
  CREATE INDEX "events_rels_parent_idx" ON "events_rels" USING btree ("parent_id");
  CREATE INDEX "events_rels_path_idx" ON "events_rels" USING btree ("path");
  CREATE INDEX "events_rels_images_id_idx" ON "events_rels" USING btree ("images_id");
  CREATE INDEX "_events_v_version_languages_order_idx" ON "_events_v_version_languages" USING btree ("order");
  CREATE INDEX "_events_v_version_languages_parent_idx" ON "_events_v_version_languages" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_schedule_weekdays_order_idx" ON "_events_v_version_schedule_weekdays" USING btree ("order");
  CREATE INDEX "_events_v_version_schedule_weekdays_parent_idx" ON "_events_v_version_schedule_weekdays" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_schedule_exclusions_order_idx" ON "_events_v_version_schedule_exclusions" USING btree ("_order");
  CREATE INDEX "_events_v_version_schedule_exclusions_parent_id_idx" ON "_events_v_version_schedule_exclusions" USING btree ("_parent_id");
  CREATE INDEX "_events_v_version_activity_log_order_idx" ON "_events_v_version_activity_log" USING btree ("_order");
  CREATE INDEX "_events_v_version_activity_log_parent_id_idx" ON "_events_v_version_activity_log" USING btree ("_parent_id");
  CREATE INDEX "_events_v_parent_idx" ON "_events_v" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_version_import_batch_idx" ON "_events_v" USING btree ("version_import_batch_id");
  CREATE INDEX "_events_v_version_version_region_idx" ON "_events_v" USING btree ("version_region_id");
  CREATE INDEX "_events_v_version_schedule_version_schedule_last_date_idx" ON "_events_v" USING btree ("version_schedule_last_date");
  CREATE INDEX "_events_v_version_version_manager_idx" ON "_events_v" USING btree ("version_manager_id");
  CREATE INDEX "_events_v_version_version_confidence_score_idx" ON "_events_v" USING btree ("version_confidence_score");
  CREATE INDEX "_events_v_version_version_submitter_idx" ON "_events_v" USING btree ("version_submitter_id");
  CREATE INDEX "_events_v_version_version_next_check_at_idx" ON "_events_v" USING btree ("version_next_check_at");
  CREATE INDEX "_events_v_version_version_quality_open_count_idx" ON "_events_v" USING btree ("version_quality_open_count");
  CREATE INDEX "_events_v_version_version_legacy_id_idx" ON "_events_v" USING btree ("version_legacy_id");
  CREATE INDEX "_events_v_version_version_updated_at_idx" ON "_events_v" USING btree ("version_updated_at");
  CREATE INDEX "_events_v_version_version_created_at_idx" ON "_events_v" USING btree ("version_created_at");
  CREATE INDEX "_events_v_version_version_deleted_at_idx" ON "_events_v" USING btree ("version_deleted_at");
  CREATE INDEX "_events_v_version_version__status_idx" ON "_events_v" USING btree ("version__status");
  CREATE INDEX "_events_v_created_at_idx" ON "_events_v" USING btree ("created_at");
  CREATE INDEX "_events_v_updated_at_idx" ON "_events_v" USING btree ("updated_at");
  CREATE INDEX "_events_v_snapshot_idx" ON "_events_v" USING btree ("snapshot");
  CREATE INDEX "_events_v_published_locale_idx" ON "_events_v" USING btree ("published_locale");
  CREATE INDEX "_events_v_latest_idx" ON "_events_v" USING btree ("latest");
  CREATE INDEX "_events_v_rels_order_idx" ON "_events_v_rels" USING btree ("order");
  CREATE INDEX "_events_v_rels_parent_idx" ON "_events_v_rels" USING btree ("parent_id");
  CREATE INDEX "_events_v_rels_path_idx" ON "_events_v_rels" USING btree ("path");
  CREATE INDEX "_events_v_rels_images_id_idx" ON "_events_v_rels" USING btree ("images_id");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "users_legacy_id_idx" ON "users" USING btree ("legacy_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE INDEX "imports_default_languages_order_idx" ON "imports_default_languages" USING btree ("order");
  CREATE INDEX "imports_default_languages_parent_idx" ON "imports_default_languages" USING btree ("parent_id");
  CREATE INDEX "imports_target_region_idx" ON "imports" USING btree ("target_region_id");
  CREATE INDEX "imports_manager_idx" ON "imports" USING btree ("manager_id");
  CREATE INDEX "imports_updated_at_idx" ON "imports" USING btree ("updated_at");
  CREATE INDEX "imports_created_at_idx" ON "imports" USING btree ("created_at");
  CREATE UNIQUE INDEX "imports_filename_idx" ON "imports" USING btree ("filename");
  CREATE INDEX "forms_blocks_checkbox_order_idx" ON "forms_blocks_checkbox" USING btree ("_order");
  CREATE INDEX "forms_blocks_checkbox_parent_id_idx" ON "forms_blocks_checkbox" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_checkbox_path_idx" ON "forms_blocks_checkbox" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_checkbox_locales_locale_parent_id_unique" ON "forms_blocks_checkbox_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_checkbox_locales_parent_id_idx" ON "forms_blocks_checkbox_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_country_order_idx" ON "forms_blocks_country" USING btree ("_order");
  CREATE INDEX "forms_blocks_country_parent_id_idx" ON "forms_blocks_country" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_country_path_idx" ON "forms_blocks_country" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_country_locales_locale_parent_id_unique" ON "forms_blocks_country_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_country_locales_parent_id_idx" ON "forms_blocks_country_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_email_order_idx" ON "forms_blocks_email" USING btree ("_order");
  CREATE INDEX "forms_blocks_email_parent_id_idx" ON "forms_blocks_email" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_email_path_idx" ON "forms_blocks_email" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_email_locales_locale_parent_id_unique" ON "forms_blocks_email_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_email_locales_parent_id_idx" ON "forms_blocks_email_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_message_order_idx" ON "forms_blocks_message" USING btree ("_order");
  CREATE INDEX "forms_blocks_message_parent_id_idx" ON "forms_blocks_message" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_message_path_idx" ON "forms_blocks_message" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_message_locales_locale_parent_id_unique" ON "forms_blocks_message_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_message_locales_parent_id_idx" ON "forms_blocks_message_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_number_order_idx" ON "forms_blocks_number" USING btree ("_order");
  CREATE INDEX "forms_blocks_number_parent_id_idx" ON "forms_blocks_number" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_number_path_idx" ON "forms_blocks_number" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_number_locales_locale_parent_id_unique" ON "forms_blocks_number_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_number_locales_parent_id_idx" ON "forms_blocks_number_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_select_options_order_idx" ON "forms_blocks_select_options" USING btree ("_order");
  CREATE INDEX "forms_blocks_select_options_parent_id_idx" ON "forms_blocks_select_options" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "forms_blocks_select_options_locales_locale_parent_id_unique" ON "forms_blocks_select_options_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_select_options_locales_parent_id_idx" ON "forms_blocks_select_options_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_select_order_idx" ON "forms_blocks_select" USING btree ("_order");
  CREATE INDEX "forms_blocks_select_parent_id_idx" ON "forms_blocks_select" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_select_path_idx" ON "forms_blocks_select" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_select_locales_locale_parent_id_unique" ON "forms_blocks_select_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_select_locales_parent_id_idx" ON "forms_blocks_select_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_state_order_idx" ON "forms_blocks_state" USING btree ("_order");
  CREATE INDEX "forms_blocks_state_parent_id_idx" ON "forms_blocks_state" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_state_path_idx" ON "forms_blocks_state" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_state_locales_locale_parent_id_unique" ON "forms_blocks_state_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_state_locales_parent_id_idx" ON "forms_blocks_state_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_text_order_idx" ON "forms_blocks_text" USING btree ("_order");
  CREATE INDEX "forms_blocks_text_parent_id_idx" ON "forms_blocks_text" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_text_path_idx" ON "forms_blocks_text" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_text_locales_locale_parent_id_unique" ON "forms_blocks_text_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_text_locales_parent_id_idx" ON "forms_blocks_text_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_textarea_order_idx" ON "forms_blocks_textarea" USING btree ("_order");
  CREATE INDEX "forms_blocks_textarea_parent_id_idx" ON "forms_blocks_textarea" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_textarea_path_idx" ON "forms_blocks_textarea" USING btree ("_path");
  CREATE UNIQUE INDEX "forms_blocks_textarea_locales_locale_parent_id_unique" ON "forms_blocks_textarea_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_blocks_textarea_locales_parent_id_idx" ON "forms_blocks_textarea_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_action_type_idx" ON "forms" USING btree ("action_type");
  CREATE INDEX "forms_recipient_idx" ON "forms" USING btree ("recipient_id");
  CREATE INDEX "forms_client_idx" ON "forms" USING btree ("client_id");
  CREATE INDEX "forms_updated_at_idx" ON "forms" USING btree ("updated_at");
  CREATE INDEX "forms_created_at_idx" ON "forms" USING btree ("created_at");
  CREATE UNIQUE INDEX "forms_locales_locale_parent_id_unique" ON "forms_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "forms_locales_parent_id_idx" ON "forms_locales" USING btree ("_parent_id");
  CREATE INDEX "user_submissions_submission_data_order_idx" ON "user_submissions_submission_data" USING btree ("_order");
  CREATE INDEX "user_submissions_submission_data_parent_id_idx" ON "user_submissions_submission_data" USING btree ("_parent_id");
  CREATE INDEX "user_submissions_activity_log_order_idx" ON "user_submissions_activity_log" USING btree ("_order");
  CREATE INDEX "user_submissions_activity_log_parent_id_idx" ON "user_submissions_activity_log" USING btree ("_parent_id");
  CREATE INDEX "user_submissions_unsubscribed_at_idx" ON "user_submissions" USING btree ("unsubscribed_at");
  CREATE INDEX "user_submissions_manager_idx" ON "user_submissions" USING btree ("manager_id");
  CREATE INDEX "user_submissions_region_idx" ON "user_submissions" USING btree ("region_id");
  CREATE INDEX "user_submissions_type_idx" ON "user_submissions" USING btree ("type");
  CREATE INDEX "user_submissions_status_idx" ON "user_submissions" USING btree ("status");
  CREATE INDEX "user_submissions_user_idx" ON "user_submissions" USING btree ("user_id");
  CREATE INDEX "user_submissions_client_idx" ON "user_submissions" USING btree ("client_id");
  CREATE INDEX "user_submissions_form_idx" ON "user_submissions" USING btree ("form_id");
  CREATE INDEX "user_submissions_event_idx" ON "user_submissions" USING btree ("event_id");
  CREATE UNIQUE INDEX "user_submissions_uuid_idx" ON "user_submissions" USING btree ("uuid");
  CREATE INDEX "user_submissions_routing_region_idx" ON "user_submissions" USING btree ("routing_region_id");
  CREATE INDEX "user_submissions_updated_at_idx" ON "user_submissions" USING btree ("updated_at");
  CREATE INDEX "user_submissions_created_at_idx" ON "user_submissions" USING btree ("created_at");
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
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
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
  CREATE INDEX "payload_locked_documents_rels_transcripts_id_idx" ON "payload_locked_documents_rels" USING btree ("transcripts_id");
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
  CREATE INDEX "payload_locked_documents_rels_regions_id_idx" ON "payload_locked_documents_rels" USING btree ("regions_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_forms_id_idx" ON "payload_locked_documents_rels" USING btree ("forms_id");
  CREATE INDEX "payload_locked_documents_rels_user_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("user_submissions_id");
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
  CREATE INDEX "wm_web_config_available_locales_order_idx" ON "wm_web_config_available_locales" USING btree ("order");
  CREATE INDEX "wm_web_config_available_locales_parent_idx" ON "wm_web_config_available_locales" USING btree ("parent_id");
  CREATE INDEX "wm_web_config_home_page_idx" ON "wm_web_config" USING btree ("home_page_id");
  CREATE INDEX "wm_web_config_rels_order_idx" ON "wm_web_config_rels" USING btree ("order");
  CREATE INDEX "wm_web_config_rels_parent_idx" ON "wm_web_config_rels" USING btree ("parent_id");
  CREATE INDEX "wm_web_config_rels_path_idx" ON "wm_web_config_rels" USING btree ("path");
  CREATE INDEX "wm_web_config_rels_audiences_id_idx" ON "wm_web_config_rels" USING btree ("audiences_id");
  CREATE INDEX "wm_web_config_rels_pages_id_idx" ON "wm_web_config_rels" USING btree ("pages_id");
  CREATE INDEX "wm_web_translations__status_idx" ON "wm_web_translations_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "wm_web_translations_locales_locale_parent_id_unique" ON "wm_web_translations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wm_web_translations_locales_parent_id_idx" ON "wm_web_translations_locales" USING btree ("_parent_id");
  CREATE INDEX "_wm_web_translations_v_created_at_idx" ON "_wm_web_translations_v" USING btree ("created_at");
  CREATE INDEX "_wm_web_translations_v_updated_at_idx" ON "_wm_web_translations_v" USING btree ("updated_at");
  CREATE INDEX "_wm_web_translations_v_snapshot_idx" ON "_wm_web_translations_v" USING btree ("snapshot");
  CREATE INDEX "_wm_web_translations_v_published_locale_idx" ON "_wm_web_translations_v" USING btree ("published_locale");
  CREATE INDEX "_wm_web_translations_v_latest_idx" ON "_wm_web_translations_v" USING btree ("latest");
  CREATE INDEX "_wm_web_translations_v_version_version__status_idx" ON "_wm_web_translations_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_wm_web_translations_v_locales_locale_parent_id_unique" ON "_wm_web_translations_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_wm_web_translations_v_locales_parent_id_idx" ON "_wm_web_translations_v_locales" USING btree ("_parent_id");
  CREATE INDEX "wm_app_config_available_locales_order_idx" ON "wm_app_config_available_locales" USING btree ("order");
  CREATE INDEX "wm_app_config_available_locales_parent_idx" ON "wm_app_config_available_locales" USING btree ("parent_id");
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
  CREATE INDEX "wm_app_config_locales_parent_id_idx" ON "wm_app_config_locales" USING btree ("_parent_id");
  CREATE INDEX "wm_app_translations__status_idx" ON "wm_app_translations_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "wm_app_translations_locales_locale_parent_id_unique" ON "wm_app_translations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wm_app_translations_locales_parent_id_idx" ON "wm_app_translations_locales" USING btree ("_parent_id");
  CREATE INDEX "_wm_app_translations_v_created_at_idx" ON "_wm_app_translations_v" USING btree ("created_at");
  CREATE INDEX "_wm_app_translations_v_updated_at_idx" ON "_wm_app_translations_v" USING btree ("updated_at");
  CREATE INDEX "_wm_app_translations_v_snapshot_idx" ON "_wm_app_translations_v" USING btree ("snapshot");
  CREATE INDEX "_wm_app_translations_v_published_locale_idx" ON "_wm_app_translations_v" USING btree ("published_locale");
  CREATE INDEX "_wm_app_translations_v_latest_idx" ON "_wm_app_translations_v" USING btree ("latest");
  CREATE INDEX "_wm_app_translations_v_version_version__status_idx" ON "_wm_app_translations_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_wm_app_translations_v_locales_locale_parent_id_unique" ON "_wm_app_translations_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_wm_app_translations_v_locales_parent_id_idx" ON "_wm_app_translations_v_locales" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "wm_app_status_locales_locale_parent_id_unique" ON "wm_app_status_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "wm_app_status_locales_parent_id_idx" ON "wm_app_status_locales" USING btree ("_parent_id");
  CREATE INDEX "wm_app_status_rels_order_idx" ON "wm_app_status_rels" USING btree ("order");
  CREATE INDEX "wm_app_status_rels_parent_idx" ON "wm_app_status_rels" USING btree ("parent_id");
  CREATE INDEX "wm_app_status_rels_path_idx" ON "wm_app_status_rels" USING btree ("path");
  CREATE INDEX "wm_app_status_rels_app_cards_id_idx" ON "wm_app_status_rels" USING btree ("app_cards_id");
  CREATE INDEX "sy_atlas_config_available_locales_order_idx" ON "sy_atlas_config_available_locales" USING btree ("order");
  CREATE INDEX "sy_atlas_config_available_locales_parent_idx" ON "sy_atlas_config_available_locales" USING btree ("parent_id");
  CREATE INDEX "sy_atlas_config_canonical_fallback_client_idx" ON "sy_atlas_config" USING btree ("canonical_fallback_client_id");
  CREATE INDEX "sy_atlas_config_report_issue_form_idx" ON "sy_atlas_config" USING btree ("report_issue_form_id");
  CREATE INDEX "sy_atlas_translations__status_idx" ON "sy_atlas_translations_locales" USING btree ("_status","_locale");
  CREATE UNIQUE INDEX "sy_atlas_translations_locales_locale_parent_id_unique" ON "sy_atlas_translations_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "sy_atlas_translations_locales_parent_id_idx" ON "sy_atlas_translations_locales" USING btree ("_parent_id");
  CREATE INDEX "_sy_atlas_translations_v_created_at_idx" ON "_sy_atlas_translations_v" USING btree ("created_at");
  CREATE INDEX "_sy_atlas_translations_v_updated_at_idx" ON "_sy_atlas_translations_v" USING btree ("updated_at");
  CREATE INDEX "_sy_atlas_translations_v_snapshot_idx" ON "_sy_atlas_translations_v" USING btree ("snapshot");
  CREATE INDEX "_sy_atlas_translations_v_published_locale_idx" ON "_sy_atlas_translations_v" USING btree ("published_locale");
  CREATE INDEX "_sy_atlas_translations_v_latest_idx" ON "_sy_atlas_translations_v" USING btree ("latest");
  CREATE INDEX "_sy_atlas_translations_v_version_version__status_idx" ON "_sy_atlas_translations_v_locales" USING btree ("version__status","_locale");
  CREATE UNIQUE INDEX "_sy_atlas_translations_v_locales_locale_parent_id_unique" ON "_sy_atlas_translations_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_sy_atlas_translations_v_locales_parent_id_idx" ON "_sy_atlas_translations_v_locales" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // A database that applied the pre-squash chain holds that chain's rows
  // beside this one. Rolling back here would drop its whole schema and leave
  // those rows behind, so refuse. A database built from this baseline holds
  // only this row (plus Payload's dev row, batch -1).
  const applied = await db.execute(
    sql`SELECT count(*)::int AS n FROM "payload_migrations" WHERE "batch" <> -1`,
  )
  if (Number(applied.rows[0]?.n) > 1) {
    throw new Error(
      'Refusing to roll back the squashed baseline: this database applied the pre-squash migration chain. Dropping the schema would destroy its data. See src/migrations/AGENTS.md, "Squashing the chain".',
    )
  }
  await db.execute(sql`
   DROP TABLE "pages_tags" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "pages_locales" CASCADE;
  DROP TABLE "pages_rels" CASCADE;
  DROP TABLE "_pages_v_version_tags" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  DROP TABLE "_pages_v_locales" CASCADE;
  DROP TABLE "_pages_v_rels" CASCADE;
  DROP TABLE "meditations" CASCADE;
  DROP TABLE "_meditations_v" CASCADE;
  DROP TABLE "transcripts" CASCADE;
  DROP TABLE "transcripts_rels" CASCADE;
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
  DROP TABLE "managers_contact_details" CASCADE;
  DROP TABLE "managers_sessions" CASCADE;
  DROP TABLE "managers" CASCADE;
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
  DROP TABLE "regions_breadcrumbs" CASCADE;
  DROP TABLE "regions" CASCADE;
  DROP TABLE "regions_rels" CASCADE;
  DROP TABLE "events_languages" CASCADE;
  DROP TABLE "events_schedule_weekdays" CASCADE;
  DROP TABLE "events_schedule_exclusions" CASCADE;
  DROP TABLE "events_activity_log" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "events_rels" CASCADE;
  DROP TABLE "_events_v_version_languages" CASCADE;
  DROP TABLE "_events_v_version_schedule_weekdays" CASCADE;
  DROP TABLE "_events_v_version_schedule_exclusions" CASCADE;
  DROP TABLE "_events_v_version_activity_log" CASCADE;
  DROP TABLE "_events_v" CASCADE;
  DROP TABLE "_events_v_rels" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "imports_default_languages" CASCADE;
  DROP TABLE "imports" CASCADE;
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
  DROP TABLE "forms" CASCADE;
  DROP TABLE "forms_locales" CASCADE;
  DROP TABLE "user_submissions_submission_data" CASCADE;
  DROP TABLE "user_submissions_activity_log" CASCADE;
  DROP TABLE "user_submissions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_jobs_log" CASCADE;
  DROP TABLE "payload_jobs" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "wm_web_config_available_locales" CASCADE;
  DROP TABLE "wm_web_config" CASCADE;
  DROP TABLE "wm_web_config_rels" CASCADE;
  DROP TABLE "wm_web_translations" CASCADE;
  DROP TABLE "wm_web_translations_locales" CASCADE;
  DROP TABLE "_wm_web_translations_v" CASCADE;
  DROP TABLE "_wm_web_translations_v_locales" CASCADE;
  DROP TABLE "wm_app_config_available_locales" CASCADE;
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
  DROP TABLE "sy_atlas_config_available_locales" CASCADE;
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
  DROP TYPE "public"."enum__pages_v_published_locale";
  DROP TYPE "public"."enum__pages_v_version_status";
  DROP TYPE "public"."enum_meditations_locale";
  DROP TYPE "public"."enum_meditations_type";
  DROP TYPE "public"."enum_meditations_status";
  DROP TYPE "public"."enum__meditations_v_version_locale";
  DROP TYPE "public"."enum__meditations_v_version_type";
  DROP TYPE "public"."enum__meditations_v_version_status";
  DROP TYPE "public"."enum__meditations_v_published_locale";
  DROP TYPE "public"."enum_transcripts_provider";
  DROP TYPE "public"."enum_videos_tags";
  DROP TYPE "public"."enum_lessons_unit";
  DROP TYPE "public"."enum_lectures_subtitles_locale";
  DROP TYPE "public"."enum_lectures_type";
  DROP TYPE "public"."enum_frames_tags";
  DROP TYPE "public"."enum_frames_image_set";
  DROP TYPE "public"."enum_narrators_gender";
  DROP TYPE "public"."enum_images_tags";
  DROP TYPE "public"."enum_files_spoken_language";
  DROP TYPE "public"."enum_audiences_location_countries";
  DROP TYPE "public"."enum_user_choices_timings";
  DROP TYPE "public"."enum_user_choices_type";
  DROP TYPE "public"."enum_subtle_system_nodes_slug";
  DROP TYPE "public"."enum_managers_roles";
  DROP TYPE "public"."enum_managers_contact_details_platform";
  DROP TYPE "public"."enum_managers_current_project";
  DROP TYPE "public"."enum_managers_type";
  DROP TYPE "public"."enum_managers_language";
  DROP TYPE "public"."enum_clients_roles";
  DROP TYPE "public"."enum_clients_mailing_list_provider";
  DROP TYPE "public"."enum_clients_site_track";
  DROP TYPE "public"."enum_clients_site_embed_height";
  DROP TYPE "public"."enum_clients_language";
  DROP TYPE "public"."enum_app_cards_schedule_weekdays";
  DROP TYPE "public"."enum_app_cards_target_sections";
  DROP TYPE "public"."enum_app_cards_timings";
  DROP TYPE "public"."enum_app_cards_type";
  DROP TYPE "public"."enum_app_cards_default_aspect_ratio";
  DROP TYPE "public"."enum_app_cards_default_text_color";
  DROP TYPE "public"."enum_app_cards_default_alignment";
  DROP TYPE "public"."enum_app_cards_starting_soon_aspect_ratio";
  DROP TYPE "public"."enum_app_cards_starting_soon_text_color";
  DROP TYPE "public"."enum_app_cards_starting_soon_alignment";
  DROP TYPE "public"."enum_app_cards_live_now_aspect_ratio";
  DROP TYPE "public"."enum_app_cards_live_now_text_color";
  DROP TYPE "public"."enum_app_cards_live_now_alignment";
  DROP TYPE "public"."enum_app_cards_schedule_firstdate_tz";
  DROP TYPE "public"."enum_app_cards_schedule_recurrence_type";
  DROP TYPE "public"."enum_app_cards_default_destination";
  DROP TYPE "public"."enum_app_cards_starting_soon_destination";
  DROP TYPE "public"."enum_app_cards_live_now_destination";
  DROP TYPE "public"."enum_app_cards_status";
  DROP TYPE "public"."enum__app_cards_v_version_schedule_weekdays";
  DROP TYPE "public"."enum__app_cards_v_version_target_sections";
  DROP TYPE "public"."enum__app_cards_v_version_timings";
  DROP TYPE "public"."enum__app_cards_v_version_type";
  DROP TYPE "public"."enum__app_cards_v_version_default_aspect_ratio";
  DROP TYPE "public"."enum__app_cards_v_version_default_text_color";
  DROP TYPE "public"."enum__app_cards_v_version_default_alignment";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_aspect_ratio";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_text_color";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_alignment";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_aspect_ratio";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_text_color";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_alignment";
  DROP TYPE "public"."enum__app_cards_v_version_schedule_firstdate_tz";
  DROP TYPE "public"."enum__app_cards_v_version_schedule_recurrence_type";
  DROP TYPE "public"."enum__app_cards_v_published_locale";
  DROP TYPE "public"."enum__app_cards_v_version_default_destination";
  DROP TYPE "public"."enum__app_cards_v_version_starting_soon_destination";
  DROP TYPE "public"."enum__app_cards_v_version_live_now_destination";
  DROP TYPE "public"."enum__app_cards_v_version_status";
  DROP TYPE "public"."enum_regions_level";
  DROP TYPE "public"."enum_events_languages";
  DROP TYPE "public"."enum_events_schedule_weekdays";
  DROP TYPE "public"."enum_events_event_type";
  DROP TYPE "public"."enum_events_schedule_firstdate_tz";
  DROP TYPE "public"."enum_events_schedule_recurrence_type";
  DROP TYPE "public"."enum_events_schedule_monthly_mode";
  DROP TYPE "public"."enum_events_schedule_week_number";
  DROP TYPE "public"."enum_events_schedule_weekday_of_month";
  DROP TYPE "public"."enum_events_schedule_ending_type";
  DROP TYPE "public"."enum_events_registration_mode";
  DROP TYPE "public"."enum_events_registration_notification_frequency";
  DROP TYPE "public"."enum_events_verification_stage";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum__events_v_version_languages";
  DROP TYPE "public"."enum__events_v_version_schedule_weekdays";
  DROP TYPE "public"."enum__events_v_version_event_type";
  DROP TYPE "public"."enum__events_v_version_schedule_firstdate_tz";
  DROP TYPE "public"."enum__events_v_version_schedule_recurrence_type";
  DROP TYPE "public"."enum__events_v_version_schedule_monthly_mode";
  DROP TYPE "public"."enum__events_v_version_schedule_week_number";
  DROP TYPE "public"."enum__events_v_version_schedule_weekday_of_month";
  DROP TYPE "public"."enum__events_v_version_schedule_ending_type";
  DROP TYPE "public"."enum__events_v_version_registration_mode";
  DROP TYPE "public"."enum__events_v_version_status";
  DROP TYPE "public"."enum__events_v_published_locale";
  DROP TYPE "public"."enum_imports_default_languages";
  DROP TYPE "public"."enum_imports_status";
  DROP TYPE "public"."enum_forms_confirmation_type";
  DROP TYPE "public"."enum_forms_action_type";
  DROP TYPE "public"."enum_user_submissions_startingat_tz";
  DROP TYPE "public"."enum_user_submissions_event_feedback";
  DROP TYPE "public"."enum_user_submissions_type";
  DROP TYPE "public"."enum_user_submissions_status";
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  DROP TYPE "public"."enum_payload_jobs_log_state";
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  DROP TYPE "public"."enum_wm_web_config_available_locales";
  DROP TYPE "public"."enum_wm_web_translations_status";
  DROP TYPE "public"."enum__wm_web_translations_v_published_locale";
  DROP TYPE "public"."enum__wm_web_translations_v_version_status";
  DROP TYPE "public"."enum_wm_app_config_available_locales";
  DROP TYPE "public"."enum_wm_app_config_vibe_check_tracks_identifier";
  DROP TYPE "public"."enum_wm_app_translations_status";
  DROP TYPE "public"."enum__wm_app_translations_v_published_locale";
  DROP TYPE "public"."enum__wm_app_translations_v_version_status";
  DROP TYPE "public"."enum_wm_app_status_baseline_country";
  DROP TYPE "public"."enum_sy_atlas_config_available_locales";
  DROP TYPE "public"."enum_sy_atlas_translations_status";
  DROP TYPE "public"."enum__sy_atlas_translations_v_published_locale";
  DROP TYPE "public"."enum__sy_atlas_translations_v_version_status";`)
}
