import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Standardize the compound locale code to BCP-47 (pt-br -> pt-BR) and add the
// new en-AU locale across every locale enum, plus add the three new
// wm-web-translations leaf-group columns (footer / page_tags / errors).
//
// This intentionally diverges from Payload's default generated SQL. The
// generator drops and recreates each enum type and casts every _locale column
// back via `USING "_locale"::"_locales"` — which FAILS on any existing 'pt-br'
// row because the recreated enum no longer contains that value
// ("invalid input value for enum"). `ALTER TYPE ... RENAME VALUE` instead
// updates the label in place, atomically and without touching table data, so
// no localized-content backfill is required. `RENAME VALUE` / `ADD VALUE` both
// run inside the migration transaction on Postgres 12+ (the new en-AU value is
// never referenced in the same transaction).
//
// The .json snapshot is left exactly as generated (it already records the
// pt-BR / en-AU / new-column end state) — only these up/down bodies are
// hand-written.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."_locales" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."_locales" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__pages_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__pages_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum_meditations_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum_meditations_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__meditations_v_version_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__meditations_v_version_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__meditations_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__meditations_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum_lectures_subtitles_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum_lectures_subtitles_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__clients_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__clients_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__app_cards_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__app_cards_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__events_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__events_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__wm_web_translations_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__wm_web_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__wm_app_translations_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__wm_app_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TYPE "public"."enum__sy_atlas_translations_v_published_locale" RENAME VALUE 'pt-br' TO 'pt-BR';
    ALTER TYPE "public"."enum__sy_atlas_translations_v_published_locale" ADD VALUE IF NOT EXISTS 'en-AU';
    ALTER TABLE "wm_web_translations_locales" ADD COLUMN "footer" jsonb;
    ALTER TABLE "wm_web_translations_locales" ADD COLUMN "page_tags" jsonb;
    ALTER TABLE "wm_web_translations_locales" ADD COLUMN "errors" jsonb;
    ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_footer" jsonb;
    ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_page_tags" jsonb;
    ALTER TABLE "_wm_web_translations_v_locales" ADD COLUMN "version_errors" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Reverse the BCP-47 rename. The added en-AU value is intentionally left in
  // place: Postgres cannot DROP an enum value without recreating the type, and
  // production migration flow is forward-only.
  await db.execute(sql`
    ALTER TABLE "wm_web_translations_locales" DROP COLUMN "footer";
    ALTER TABLE "wm_web_translations_locales" DROP COLUMN "page_tags";
    ALTER TABLE "wm_web_translations_locales" DROP COLUMN "errors";
    ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_footer";
    ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_page_tags";
    ALTER TABLE "_wm_web_translations_v_locales" DROP COLUMN "version_errors";
    ALTER TYPE "public"."_locales" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__pages_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum_meditations_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__meditations_v_version_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__meditations_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum_lectures_subtitles_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__clients_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__app_cards_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__events_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__wm_web_translations_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__wm_app_translations_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';
    ALTER TYPE "public"."enum__sy_atlas_translations_v_published_locale" RENAME VALUE 'pt-BR' TO 'pt-br';`)
}
