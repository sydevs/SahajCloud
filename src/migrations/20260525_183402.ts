import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`wm_app_status\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE \`wm_app_status_locales\` (
  	\`baseline_country\` text DEFAULT 'GB' NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_status\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`wm_app_status_locales_locale_parent_id_unique\` ON \`wm_app_status_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`wm_app_status_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`app_cards_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`wm_app_status\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app_cards_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_order_idx\` ON \`wm_app_status_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_parent_idx\` ON \`wm_app_status_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_path_idx\` ON \`wm_app_status_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_status_rels_app_cards_id_idx\` ON \`wm_app_status_rels\` (\`app_cards_id\`);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`classes_page_id\` integer NOT NULL REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`live_meditations_page_id\` integer NOT NULL REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`techniques_page_id\` integer NOT NULL REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`lectures_page_id\` integer NOT NULL REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`privacy_page_id\` integer NOT NULL REFERENCES pages(id);`)
  await db.run(sql`ALTER TABLE \`wm_app_config\` ADD \`terms_page_id\` integer NOT NULL REFERENCES pages(id);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_classes_page_idx\` ON \`wm_app_config\` (\`classes_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_live_meditations_page_idx\` ON \`wm_app_config\` (\`live_meditations_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_techniques_page_idx\` ON \`wm_app_config\` (\`techniques_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_lectures_page_idx\` ON \`wm_app_config\` (\`lectures_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_privacy_page_idx\` ON \`wm_app_config\` (\`privacy_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_terms_page_idx\` ON \`wm_app_config\` (\`terms_page_id\`);`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_welcome_strings\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_welcome_legal_disclaimer\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_user_type_strings\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_user_type_title\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_carousel_strings\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_carousel_page_true_self_title\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_strings\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_body_never_share\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_body_never_sell\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_body_intro\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`profile_privacy_advertising_strings\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`profile_privacy_advertising_advertising_body_never_share\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`profile_privacy_advertising_advertising_body_intro\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`meditation_footsoak_strings\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`meditation_footsoak_description\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`auth_create_account_strings\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`auth_create_account_consent_label\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_welcome\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_user_type\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_carousel\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_consent_modal\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`profile_privacy_advertising\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`meditation_footsoak\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`auth_create_account\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_welcome_strings\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_welcome_legal_disclaimer\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_user_type_strings\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_user_type_title\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_carousel_strings\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_carousel_page_true_self_title\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_strings\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_body_never_share\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_body_never_sell\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_body_intro\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_profile_privacy_advertising_strings\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_profile_privacy_advertising_advertising_body_never_share\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_profile_privacy_advertising_advertising_body_intro\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_meditation_footsoak_strings\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_meditation_footsoak_description\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_auth_create_account_strings\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_auth_create_account_consent_label\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_last_reviewed_at\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_welcome\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_user_type\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_carousel\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_consent_modal\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_profile_privacy_advertising\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_meditation_footsoak\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_auth_create_account\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`wm_app_status\`;`)
  await db.run(sql`DROP TABLE \`wm_app_status_locales\`;`)
  await db.run(sql`DROP TABLE \`wm_app_status_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_wm_app_config\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`shri_mataji_page_id\` integer NOT NULL,
  	\`sahaja_yoga_page_id\` integer NOT NULL,
  	\`explore_page_id\` integer NOT NULL,
  	\`subtle_system_page_id\` integer NOT NULL,
  	\`fallback_lecture_id\` integer,
  	\`ios_app_url\` text,
  	\`android_app_url\` text,
  	\`updated_at\` text,
  	\`created_at\` text,
  	FOREIGN KEY (\`shri_mataji_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`sahaja_yoga_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`explore_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`subtle_system_page_id\`) REFERENCES \`pages\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`fallback_lecture_id\`) REFERENCES \`lectures\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`INSERT INTO \`__new_wm_app_config\`("id", "shri_mataji_page_id", "sahaja_yoga_page_id", "explore_page_id", "subtle_system_page_id", "fallback_lecture_id", "ios_app_url", "android_app_url", "updated_at", "created_at") SELECT "id", "shri_mataji_page_id", "sahaja_yoga_page_id", "explore_page_id", "subtle_system_page_id", "fallback_lecture_id", "ios_app_url", "android_app_url", "updated_at", "created_at" FROM \`wm_app_config\`;`)
  await db.run(sql`DROP TABLE \`wm_app_config\`;`)
  await db.run(sql`ALTER TABLE \`__new_wm_app_config\` RENAME TO \`wm_app_config\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`wm_app_config_shri_mataji_page_idx\` ON \`wm_app_config\` (\`shri_mataji_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_sahaja_yoga_page_idx\` ON \`wm_app_config\` (\`sahaja_yoga_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_explore_page_idx\` ON \`wm_app_config\` (\`explore_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_subtle_system_page_idx\` ON \`wm_app_config\` (\`subtle_system_page_id\`);`)
  await db.run(sql`CREATE INDEX \`wm_app_config_fallback_lecture_idx\` ON \`wm_app_config\` (\`fallback_lecture_id\`);`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_welcome\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_user_type\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_carousel\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`profile_privacy_advertising\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`meditation_footsoak\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`auth_create_account\` text;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_welcome_strings\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_welcome_legal_disclaimer\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_user_type_strings\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_user_type_title\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_carousel_strings\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_carousel_page_true_self_title\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_consent_modal_strings\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_consent_modal_body_never_share\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_consent_modal_body_never_sell\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_consent_modal_body_intro\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`profile_privacy_advertising_strings\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`profile_privacy_advertising_advertising_body_never_share\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`profile_privacy_advertising_advertising_body_intro\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`meditation_footsoak_strings\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`meditation_footsoak_description\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`auth_create_account_strings\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`auth_create_account_consent_label\`;`)
  await db.run(sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`last_reviewed_at\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_welcome\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_user_type\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_carousel\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_profile_privacy_advertising\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_meditation_footsoak\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_auth_create_account\` text;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_welcome_strings\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_welcome_legal_disclaimer\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_user_type_strings\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_user_type_title\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_carousel_strings\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_carousel_page_true_self_title\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_consent_modal_strings\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_consent_modal_body_never_share\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_consent_modal_body_never_sell\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_consent_modal_body_intro\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_profile_privacy_advertising_strings\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_profile_privacy_advertising_advertising_body_never_share\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_profile_privacy_advertising_advertising_body_intro\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_meditation_footsoak_strings\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_meditation_footsoak_description\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_auth_create_account_strings\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_auth_create_account_consent_label\`;`)
  await db.run(sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_last_reviewed_at\`;`)
}
