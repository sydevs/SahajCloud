import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Add the Hungarian (hu) and Dutch (nl) locales across every localization
// locale enum, aligning SahajCloud's LOCALES set with the UI translation
// bundles SahajAtlas ships (Refs #578).
//
// This intentionally diverges from Payload's default generated SQL. The
// generator drops and recreates each enum type and casts every _locale column
// back via `USING "_locale"::"_locales"` — which FAILS on any existing row
// whose locale is not in the recreated enum ("invalid input value for enum").
// `ALTER TYPE ... ADD VALUE` instead appends the value in place without
// touching table data, so no localized-content backfill is required.
// `ADD VALUE` runs inside the migration transaction on Postgres 12+ (the new
// values are never referenced in the same transaction).
//
// The two `clients_locale` enums are intentionally untouched: they hold the
// full ISO 639-1 language list (the Clients language field, not the
// localization locale set) and already contain 'hu' and 'nl'.
//
// The .json snapshot is generated to record the new end state; only these
// up/down bodies are hand-written.

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."_locales" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."_locales" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__pages_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__pages_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum_meditations_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum_meditations_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__meditations_v_version_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__meditations_v_version_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__meditations_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__meditations_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum_lectures_subtitles_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum_lectures_subtitles_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__clients_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__clients_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__app_cards_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__app_cards_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__events_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__events_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__wm_web_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__wm_web_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__wm_app_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__wm_app_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';
    ALTER TYPE "public"."enum__sy_atlas_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'hu';
    ALTER TYPE "public"."enum__sy_atlas_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'nl';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op. Postgres cannot DROP an enum value without recreating the type
  // (and re-casting every _locale column), and the production migration flow
  // is forward-only. The added 'hu'/'nl' values are intentionally left in
  // place, mirroring how en-AU was handled in the BCP-47 migration.
}
