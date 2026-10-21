import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Move each view tab's `destination` discriminator into the `_locales` tables,
 * so it is per locale like the `url` it selects (#1001).
 *
 * ⚠ **The backfill between the two DDL blocks is hand-written, and the
 * migration loses every card's destination without it.** Drizzle's generated
 * delta adds the locale column and drops the base column, with nothing in
 * between — so every card reads no destination in any locale after the deploy,
 * and `GET /api/app-cards/for-audience` serves cards the app cannot open.
 *
 * It **inserts** rather than updates, unlike
 * `20260911_235823_pages_app_cards_localize_status.ts`. A card created with the
 * admin switched to French has a base `destination` and no `en` locale row at
 * all, so an `UPDATE … FROM` would copy that card's value nowhere and drop it.
 * `_status` takes its `draft` default on a row created here, which is what the
 * missing row already meant.
 *
 * `en` alone carries the value because that is the only locale the old column
 * could be read as: every other locale resolved it through Payload's English
 * fallback, and still does while it holds no value of its own.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_cards_locales" ADD COLUMN "default_destination" "enum_app_cards_default_destination";
  ALTER TABLE "app_cards_locales" ADD COLUMN "starting_soon_destination" "enum_app_cards_starting_soon_destination";
  ALTER TABLE "app_cards_locales" ADD COLUMN "live_now_destination" "enum_app_cards_live_now_destination";
  ALTER TABLE "_app_cards_v_locales" ADD COLUMN "version_default_destination" "enum__app_cards_v_version_default_destination";
  ALTER TABLE "_app_cards_v_locales" ADD COLUMN "version_starting_soon_destination" "enum__app_cards_v_version_starting_soon_destination";
  ALTER TABLE "_app_cards_v_locales" ADD COLUMN "version_live_now_destination" "enum__app_cards_v_version_live_now_destination";`)

  // Backfill, while the base column still exists. Not generated — see above.
  await db.execute(sql`
   INSERT INTO "app_cards_locales" ("_locale", "_parent_id", "default_destination", "starting_soon_destination", "live_now_destination")
    SELECT 'en'::"_locales", c."id", c."default_destination", c."starting_soon_destination", c."live_now_destination"
      FROM "app_cards" AS c
     WHERE c."default_destination" IS NOT NULL
        OR c."starting_soon_destination" IS NOT NULL
        OR c."live_now_destination" IS NOT NULL
    ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
      "default_destination" = EXCLUDED."default_destination",
      "starting_soon_destination" = EXCLUDED."starting_soon_destination",
      "live_now_destination" = EXCLUDED."live_now_destination";
  INSERT INTO "_app_cards_v_locales" ("_locale", "_parent_id", "version_default_destination", "version_starting_soon_destination", "version_live_now_destination")
    SELECT 'en'::"_locales", v."id", v."version_default_destination", v."version_starting_soon_destination", v."version_live_now_destination"
      FROM "_app_cards_v" AS v
     WHERE v."version_default_destination" IS NOT NULL
        OR v."version_starting_soon_destination" IS NOT NULL
        OR v."version_live_now_destination" IS NOT NULL
    ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
      "version_default_destination" = EXCLUDED."version_default_destination",
      "version_starting_soon_destination" = EXCLUDED."version_starting_soon_destination",
      "version_live_now_destination" = EXCLUDED."version_live_now_destination";`)

  await db.execute(sql`
   ALTER TABLE "app_cards" DROP COLUMN "default_destination";
  ALTER TABLE "app_cards" DROP COLUMN "starting_soon_destination";
  ALTER TABLE "app_cards" DROP COLUMN "live_now_destination";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version_default_destination";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version_starting_soon_destination";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version_live_now_destination";`)
}

/**
 * The mirror image, and it needs its own backfill for the same reason: the
 * restored base column is NULL, so a rolled-back deploy would leave every card
 * with no destination at all.
 *
 * Collapsing 19 locales back to one value loses information by definition.
 * `en` is the value restored, because it is the one the single column meant.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_cards" ADD COLUMN "default_destination" "enum_app_cards_default_destination";
  ALTER TABLE "app_cards" ADD COLUMN "starting_soon_destination" "enum_app_cards_starting_soon_destination";
  ALTER TABLE "app_cards" ADD COLUMN "live_now_destination" "enum_app_cards_live_now_destination";
  ALTER TABLE "_app_cards_v" ADD COLUMN "version_default_destination" "enum__app_cards_v_version_default_destination";
  ALTER TABLE "_app_cards_v" ADD COLUMN "version_starting_soon_destination" "enum__app_cards_v_version_starting_soon_destination";
  ALTER TABLE "_app_cards_v" ADD COLUMN "version_live_now_destination" "enum__app_cards_v_version_live_now_destination";`)

  // Backfill, while the locale column still exists. Not generated — see above.
  await db.execute(sql`
   UPDATE "app_cards" AS c SET
      "default_destination" = l."default_destination",
      "starting_soon_destination" = l."starting_soon_destination",
      "live_now_destination" = l."live_now_destination"
    FROM "app_cards_locales" AS l
   WHERE l."_parent_id" = c."id" AND l."_locale" = 'en';
  UPDATE "_app_cards_v" AS v SET
      "version_default_destination" = l."version_default_destination",
      "version_starting_soon_destination" = l."version_starting_soon_destination",
      "version_live_now_destination" = l."version_live_now_destination"
    FROM "_app_cards_v_locales" AS l
   WHERE l."_parent_id" = v."id" AND l."_locale" = 'en';`)

  await db.execute(sql`
   ALTER TABLE "app_cards_locales" DROP COLUMN "default_destination";
  ALTER TABLE "app_cards_locales" DROP COLUMN "starting_soon_destination";
  ALTER TABLE "app_cards_locales" DROP COLUMN "live_now_destination";
  ALTER TABLE "_app_cards_v_locales" DROP COLUMN "version_default_destination";
  ALTER TABLE "_app_cards_v_locales" DROP COLUMN "version_starting_soon_destination";
  ALTER TABLE "_app_cards_v_locales" DROP COLUMN "version_live_now_destination";`)
}
