import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

type MigrationDB = MigrateUpArgs['db']
type SQLStatement = ReturnType<typeof sql>
type TableInfoRow = {
  name: string
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

async function columnExists(
  db: MigrationDB,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const columns = await db.all<TableInfoRow>(
    sql.raw(`PRAGMA table_info(${quoteIdentifier(tableName)})`),
  )
  return columns.some((column) => column.name === columnName)
}

async function addColumnIfMissing(
  db: MigrationDB,
  tableName: string,
  columnName: string,
  statement: SQLStatement,
): Promise<void> {
  if (await columnExists(db, tableName, columnName)) return
  await db.run(statement)
}

async function dropColumnIfExists(
  db: MigrationDB,
  tableName: string,
  columnName: string,
  statement: SQLStatement,
): Promise<void> {
  if (!(await columnExists(db, tableName, columnName))) return
  await db.run(statement)
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`wm_app_status\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`wm_app_status_locales\` (
  	\`baseline_country\` text DEFAULT 'GB' NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`wm_app_status\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`wm_app_status_locales_locale_parent_id_unique\` ON \`wm_app_status_locales\` (\`_locale\`,\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE IF NOT EXISTS \`wm_app_status_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`app_cards_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`wm_app_status\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`app_cards_id\`) REFERENCES \`app_cards\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_status_rels_order_idx\` ON \`wm_app_status_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_status_rels_parent_idx\` ON \`wm_app_status_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_status_rels_path_idx\` ON \`wm_app_status_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_status_rels_app_cards_id_idx\` ON \`wm_app_status_rels\` (\`app_cards_id\`);`)
  await addColumnIfMissing(db, 'wm_app_config', 'classes_page_id', sql`ALTER TABLE \`wm_app_config\` ADD \`classes_page_id\` integer REFERENCES pages(id);`)
  await addColumnIfMissing(db, 'wm_app_config', 'live_meditations_page_id', sql`ALTER TABLE \`wm_app_config\` ADD \`live_meditations_page_id\` integer REFERENCES pages(id);`)
  await addColumnIfMissing(db, 'wm_app_config', 'techniques_page_id', sql`ALTER TABLE \`wm_app_config\` ADD \`techniques_page_id\` integer REFERENCES pages(id);`)
  await addColumnIfMissing(db, 'wm_app_config', 'lectures_page_id', sql`ALTER TABLE \`wm_app_config\` ADD \`lectures_page_id\` integer REFERENCES pages(id);`)
  await addColumnIfMissing(db, 'wm_app_config', 'privacy_page_id', sql`ALTER TABLE \`wm_app_config\` ADD \`privacy_page_id\` integer REFERENCES pages(id);`)
  await addColumnIfMissing(db, 'wm_app_config', 'terms_page_id', sql`ALTER TABLE \`wm_app_config\` ADD \`terms_page_id\` integer REFERENCES pages(id);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_classes_page_idx\` ON \`wm_app_config\` (\`classes_page_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_live_meditations_page_idx\` ON \`wm_app_config\` (\`live_meditations_page_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_techniques_page_idx\` ON \`wm_app_config\` (\`techniques_page_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_lectures_page_idx\` ON \`wm_app_config\` (\`lectures_page_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_privacy_page_idx\` ON \`wm_app_config\` (\`privacy_page_id\`);`)
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_terms_page_idx\` ON \`wm_app_config\` (\`terms_page_id\`);`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_welcome_strings', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_welcome_strings\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_welcome_legal_disclaimer', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_welcome_legal_disclaimer\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_user_type_strings', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_user_type_strings\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_user_type_title', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_user_type_title\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_carousel_strings', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_carousel_strings\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_carousel_page_true_self_title', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_carousel_page_true_self_title\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_consent_modal_strings', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_strings\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_consent_modal_body_never_share', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_body_never_share\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_consent_modal_body_never_sell', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_body_never_sell\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'onboarding_consent_modal_body_intro', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`onboarding_consent_modal_body_intro\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'profile_privacy_advertising_strings', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`profile_privacy_advertising_strings\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'profile_privacy_advertising_advertising_body_never_share', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`profile_privacy_advertising_advertising_body_never_share\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'profile_privacy_advertising_advertising_body_intro', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`profile_privacy_advertising_advertising_body_intro\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'meditation_footsoak_strings', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`meditation_footsoak_strings\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'meditation_footsoak_description', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`meditation_footsoak_description\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'auth_create_account_strings', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`auth_create_account_strings\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'auth_create_account_consent_label', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`auth_create_account_consent_label\` text;`)
  await addColumnIfMissing(db, 'wm_app_translations_locales', 'last_reviewed_at', sql`ALTER TABLE \`wm_app_translations_locales\` ADD \`last_reviewed_at\` text;`)
  await dropColumnIfExists(db, 'wm_app_translations_locales', 'onboarding_welcome', sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_welcome\`;`)
  await dropColumnIfExists(db, 'wm_app_translations_locales', 'onboarding_user_type', sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_user_type\`;`)
  await dropColumnIfExists(db, 'wm_app_translations_locales', 'onboarding_carousel', sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_carousel\`;`)
  await dropColumnIfExists(db, 'wm_app_translations_locales', 'onboarding_consent_modal', sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`onboarding_consent_modal\`;`)
  await dropColumnIfExists(db, 'wm_app_translations_locales', 'profile_privacy_advertising', sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`profile_privacy_advertising\`;`)
  await dropColumnIfExists(db, 'wm_app_translations_locales', 'meditation_footsoak', sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`meditation_footsoak\`;`)
  await dropColumnIfExists(db, 'wm_app_translations_locales', 'auth_create_account', sql`ALTER TABLE \`wm_app_translations_locales\` DROP COLUMN \`auth_create_account\`;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_welcome_strings', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_welcome_strings\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_welcome_legal_disclaimer', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_welcome_legal_disclaimer\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_user_type_strings', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_user_type_strings\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_user_type_title', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_user_type_title\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_carousel_strings', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_carousel_strings\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_carousel_page_true_self_title', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_carousel_page_true_self_title\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_consent_modal_strings', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_strings\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_consent_modal_body_never_share', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_body_never_share\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_consent_modal_body_never_sell', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_body_never_sell\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_onboarding_consent_modal_body_intro', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_onboarding_consent_modal_body_intro\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_profile_privacy_advertising_strings', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_profile_privacy_advertising_strings\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_profile_privacy_advertising_advertising_body_never_share', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_profile_privacy_advertising_advertising_body_never_share\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_profile_privacy_advertising_advertising_body_intro', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_profile_privacy_advertising_advertising_body_intro\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_meditation_footsoak_strings', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_meditation_footsoak_strings\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_meditation_footsoak_description', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_meditation_footsoak_description\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_auth_create_account_strings', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_auth_create_account_strings\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_auth_create_account_consent_label', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_auth_create_account_consent_label\` text;`)
  await addColumnIfMissing(db, '_wm_app_translations_v_locales', 'version_last_reviewed_at', sql`ALTER TABLE \`_wm_app_translations_v_locales\` ADD \`version_last_reviewed_at\` text;`)
  await dropColumnIfExists(db, '_wm_app_translations_v_locales', 'version_onboarding_welcome', sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_welcome\`;`)
  await dropColumnIfExists(db, '_wm_app_translations_v_locales', 'version_onboarding_user_type', sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_user_type\`;`)
  await dropColumnIfExists(db, '_wm_app_translations_v_locales', 'version_onboarding_carousel', sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_carousel\`;`)
  await dropColumnIfExists(db, '_wm_app_translations_v_locales', 'version_onboarding_consent_modal', sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_onboarding_consent_modal\`;`)
  await dropColumnIfExists(db, '_wm_app_translations_v_locales', 'version_profile_privacy_advertising', sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_profile_privacy_advertising\`;`)
  await dropColumnIfExists(db, '_wm_app_translations_v_locales', 'version_meditation_footsoak', sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_meditation_footsoak\`;`)
  await dropColumnIfExists(db, '_wm_app_translations_v_locales', 'version_auth_create_account', sql`ALTER TABLE \`_wm_app_translations_v_locales\` DROP COLUMN \`version_auth_create_account\`;`)
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
