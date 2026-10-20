import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Move five admin-edited fields into their `_locales` tables, so each stores a
 * separate value per language (#981): `videos.subtitles`, the `meditation`
 * target on all three `app-cards` view tabs, and the form-builder defaults
 * `forms.title`, `forms.redirect.url` and the `select` block's `placeholder`.
 *
 * ⚠ **The backfill between the DDL blocks is hand-written, and this migration
 * is wrong without it.** Drizzle's generated delta adds each locale column and
 * then drops the base column, so every existing value is lost. The precedent
 * is `20260911_235823_pages_app_cards_localize_status.ts`.
 *
 * Each value is copied into the **`en`** row alone. Fallback is on
 * (`src/collections/AGENTS.md`), so every other locale keeps reading exactly
 * what it reads today, and an editor narrows it per locale from there — which
 * is the point of the flag.
 *
 * One rule for all five: insert the `en` row, or update it where it exists.
 * Two of the locale tables carry a `NOT NULL` sibling, so a row inserted for a
 * parent that had none has to satisfy it — `forms_locales.title` from
 * `forms.title`, and `videos_locales.title` from whichever locale row the
 * video does have. ⚠ That second one is the only place this migration writes a
 * value the old schema did not hold: a video whose single locale row is, say,
 * French lands that French title in `en`, where English rendered blank before.
 * The alternative is losing the cues, since the base column they came from was
 * read by every locale.
 *
 * `forms_locales.title` is `NOT NULL` here, so it also needs a value in every
 * locale row that already exists, or the `SET NOT NULL` fails on a form
 * carrying only a French `submit_button_label`. The following migration drops
 * that constraint again, once `forms.title` stops being `required`.
 *
 * ⚠ **An inserted locale row states its publish state rather than taking the
 * table's.** `app_cards_locales._status` and `_app_cards_v_locales`'s
 * `version__status` default to `'draft'`, and both are the localized publish
 * state since #718 — so a card with no `en` row would gain one marked draft
 * where it had no English state at all. Both are inserted as an explicit
 * `NULL`, and left untouched on conflict so an existing row keeps its own.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_cards" DROP CONSTRAINT "app_cards_default_meditation_id_meditations_id_fk";

  ALTER TABLE "app_cards" DROP CONSTRAINT "app_cards_starting_soon_meditation_id_meditations_id_fk";

  ALTER TABLE "app_cards" DROP CONSTRAINT "app_cards_live_now_meditation_id_meditations_id_fk";

  ALTER TABLE "_app_cards_v" DROP CONSTRAINT "_app_cards_v_version_default_meditation_id_meditations_id_fk";

  ALTER TABLE "_app_cards_v" DROP CONSTRAINT "_app_cards_v_version_starting_soon_meditation_id_meditations_id_fk";

  ALTER TABLE "_app_cards_v" DROP CONSTRAINT "_app_cards_v_version_live_now_meditation_id_meditations_id_fk";

  DROP INDEX "app_cards_default_default_meditation_idx";
  DROP INDEX "app_cards_starting_soon_starting_soon_meditation_idx";
  DROP INDEX "app_cards_live_now_live_now_meditation_idx";
  DROP INDEX "_app_cards_v_version_default_version_default_meditation_idx";
  DROP INDEX "_app_cards_v_version_starting_soon_version_starting_so_4_idx";
  DROP INDEX "_app_cards_v_version_live_now_version_live_now_meditatio_idx";
  ALTER TABLE "videos_locales" ADD COLUMN "subtitles" jsonb;
  ALTER TABLE "app_cards_locales" ADD COLUMN "default_meditation_id" integer;
  ALTER TABLE "app_cards_locales" ADD COLUMN "starting_soon_meditation_id" integer;
  ALTER TABLE "app_cards_locales" ADD COLUMN "live_now_meditation_id" integer;
  ALTER TABLE "_app_cards_v_locales" ADD COLUMN "version_default_meditation_id" integer;
  ALTER TABLE "_app_cards_v_locales" ADD COLUMN "version_starting_soon_meditation_id" integer;
  ALTER TABLE "_app_cards_v_locales" ADD COLUMN "version_live_now_meditation_id" integer;
  ALTER TABLE "forms_blocks_select_locales" ADD COLUMN "placeholder" varchar;
  ALTER TABLE "forms_locales" ADD COLUMN "title" varchar;
  ALTER TABLE "forms_locales" ADD COLUMN "redirect_url" varchar;
  ALTER TABLE "app_cards_locales" ADD CONSTRAINT "app_cards_locales_default_meditation_id_meditations_id_fk" FOREIGN KEY ("default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards_locales" ADD CONSTRAINT "app_cards_locales_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards_locales" ADD CONSTRAINT "app_cards_locales_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_version_default_meditation_id_meditations_id_fk" FOREIGN KEY ("version_default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_version_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("version_starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v_locales" ADD CONSTRAINT "_app_cards_v_locales_version_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("version_live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "app_cards_default_default_meditation_idx" ON "app_cards_locales" USING btree ("default_meditation_id","_locale");
  CREATE INDEX "app_cards_starting_soon_starting_soon_meditation_idx" ON "app_cards_locales" USING btree ("starting_soon_meditation_id","_locale");
  CREATE INDEX "app_cards_live_now_live_now_meditation_idx" ON "app_cards_locales" USING btree ("live_now_meditation_id","_locale");
  CREATE INDEX "_app_cards_v_version_default_version_default_meditation_idx" ON "_app_cards_v_locales" USING btree ("version_default_meditation_id","_locale");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_4_idx" ON "_app_cards_v_locales" USING btree ("version_starting_soon_meditation_id","_locale");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_meditatio_idx" ON "_app_cards_v_locales" USING btree ("version_live_now_meditation_id","_locale");`)

  // Backfill, while the base columns still exist. Not generated — see above.
  // `title` is borrowed from the video's own locale rows, because
  // `videos_locales.title` is `NOT NULL` and `videos.title` is itself
  // localized, so there is no unlocalized English to read.
  await db.execute(sql`
   INSERT INTO "videos_locales" ("_parent_id", "_locale", "title", "subtitles")
  SELECT v."id", 'en', t."title", v."subtitles"
    FROM "videos" AS v
    JOIN (SELECT DISTINCT ON ("_parent_id") "_parent_id", "title"
            FROM "videos_locales" ORDER BY "_parent_id", "id") AS t
      ON t."_parent_id" = v."id"
   WHERE v."subtitles" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET "subtitles" = EXCLUDED."subtitles";

  INSERT INTO "app_cards_locales" (
     "_parent_id", "_locale", "_status",
     "default_meditation_id", "starting_soon_meditation_id", "live_now_meditation_id")
  SELECT c."id", 'en', NULL::"enum_app_cards_status",
         c."default_meditation_id", c."starting_soon_meditation_id", c."live_now_meditation_id"
    FROM "app_cards" AS c
   WHERE c."default_meditation_id" IS NOT NULL
      OR c."starting_soon_meditation_id" IS NOT NULL
      OR c."live_now_meditation_id" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
    "default_meditation_id" = EXCLUDED."default_meditation_id",
    "starting_soon_meditation_id" = EXCLUDED."starting_soon_meditation_id",
    "live_now_meditation_id" = EXCLUDED."live_now_meditation_id";

  INSERT INTO "_app_cards_v_locales" (
     "_parent_id", "_locale", "version__status",
     "version_default_meditation_id", "version_starting_soon_meditation_id",
     "version_live_now_meditation_id")
  SELECT v."id", 'en', NULL::"enum__app_cards_v_version_status",
         v."version_default_meditation_id", v."version_starting_soon_meditation_id",
         v."version_live_now_meditation_id"
    FROM "_app_cards_v" AS v
   WHERE v."version_default_meditation_id" IS NOT NULL
      OR v."version_starting_soon_meditation_id" IS NOT NULL
      OR v."version_live_now_meditation_id" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
    "version_default_meditation_id" = EXCLUDED."version_default_meditation_id",
    "version_starting_soon_meditation_id" = EXCLUDED."version_starting_soon_meditation_id",
    "version_live_now_meditation_id" = EXCLUDED."version_live_now_meditation_id";

  INSERT INTO "forms_blocks_select_locales" ("_parent_id", "_locale", "placeholder")
  SELECT s."id", 'en', s."placeholder" FROM "forms_blocks_select" AS s
   WHERE s."placeholder" IS NOT NULL
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET "placeholder" = EXCLUDED."placeholder";

  INSERT INTO "forms_locales" ("_parent_id", "_locale", "title", "redirect_url")
  SELECT f."id", 'en', f."title", f."redirect_url" FROM "forms" AS f
  ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET "redirect_url" = EXCLUDED."redirect_url";

  UPDATE "forms_locales" AS l SET "title" = f."title"
    FROM "forms" AS f WHERE l."_parent_id" = f."id" AND l."title" IS NULL;

  ALTER TABLE "forms_locales" ALTER COLUMN "title" SET NOT NULL;`)

  await db.execute(sql`
   ALTER TABLE "videos" DROP COLUMN "subtitles";
  ALTER TABLE "app_cards" DROP COLUMN "default_meditation_id";
  ALTER TABLE "app_cards" DROP COLUMN "starting_soon_meditation_id";
  ALTER TABLE "app_cards" DROP COLUMN "live_now_meditation_id";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version_default_meditation_id";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version_starting_soon_meditation_id";
  ALTER TABLE "_app_cards_v" DROP COLUMN "version_live_now_meditation_id";
  ALTER TABLE "forms_blocks_select" DROP COLUMN "placeholder";
  ALTER TABLE "forms" DROP COLUMN "title";
  ALTER TABLE "forms" DROP COLUMN "redirect_url";`)
}

/**
 * The mirror image, and it needs its own backfill for the same reason: the
 * restored base columns come back empty, so a rolled-back deploy would drop
 * every value `up()` just took care to keep.
 *
 * Collapsing 19 locales back to one loses information by definition. The `en`
 * value is what the base column meant, so that is what is restored.
 *
 * `forms.title` is restored before its `NOT NULL` for the same reason `up()`
 * defers it: the column cannot be added constrained to a table with rows. It
 * prefers the `en` row and falls back to the form's lowest-id locale row, so a
 * form whose `en` row has gone cannot abort the rollback on the constraint.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "app_cards_locales" DROP CONSTRAINT "app_cards_locales_default_meditation_id_meditations_id_fk";

  ALTER TABLE "app_cards_locales" DROP CONSTRAINT "app_cards_locales_starting_soon_meditation_id_meditations_id_fk";

  ALTER TABLE "app_cards_locales" DROP CONSTRAINT "app_cards_locales_live_now_meditation_id_meditations_id_fk";

  ALTER TABLE "_app_cards_v_locales" DROP CONSTRAINT "_app_cards_v_locales_version_default_meditation_id_meditations_id_fk";

  ALTER TABLE "_app_cards_v_locales" DROP CONSTRAINT "_app_cards_v_locales_version_starting_soon_meditation_id_meditations_id_fk";

  ALTER TABLE "_app_cards_v_locales" DROP CONSTRAINT "_app_cards_v_locales_version_live_now_meditation_id_meditations_id_fk";

  DROP INDEX "app_cards_default_default_meditation_idx";
  DROP INDEX "app_cards_starting_soon_starting_soon_meditation_idx";
  DROP INDEX "app_cards_live_now_live_now_meditation_idx";
  DROP INDEX "_app_cards_v_version_default_version_default_meditation_idx";
  DROP INDEX "_app_cards_v_version_starting_soon_version_starting_so_4_idx";
  DROP INDEX "_app_cards_v_version_live_now_version_live_now_meditatio_idx";
  ALTER TABLE "videos" ADD COLUMN "subtitles" jsonb;
  ALTER TABLE "app_cards" ADD COLUMN "default_meditation_id" integer;
  ALTER TABLE "app_cards" ADD COLUMN "starting_soon_meditation_id" integer;
  ALTER TABLE "app_cards" ADD COLUMN "live_now_meditation_id" integer;
  ALTER TABLE "_app_cards_v" ADD COLUMN "version_default_meditation_id" integer;
  ALTER TABLE "_app_cards_v" ADD COLUMN "version_starting_soon_meditation_id" integer;
  ALTER TABLE "_app_cards_v" ADD COLUMN "version_live_now_meditation_id" integer;
  ALTER TABLE "forms_blocks_select" ADD COLUMN "placeholder" varchar;
  ALTER TABLE "forms" ADD COLUMN "title" varchar;
  ALTER TABLE "forms" ADD COLUMN "redirect_url" varchar;`)

  // Backfill, while the locale columns still exist. Not generated — see above.
  await db.execute(sql`
   UPDATE "videos" AS v SET "subtitles" = l."subtitles"
    FROM "videos_locales" AS l
   WHERE l."_parent_id" = v."id" AND l."_locale" = 'en' AND l."subtitles" IS NOT NULL;

  UPDATE "app_cards" AS c SET
    "default_meditation_id" = l."default_meditation_id",
    "starting_soon_meditation_id" = l."starting_soon_meditation_id",
    "live_now_meditation_id" = l."live_now_meditation_id"
    FROM "app_cards_locales" AS l
   WHERE l."_parent_id" = c."id" AND l."_locale" = 'en';

  UPDATE "_app_cards_v" AS v SET
    "version_default_meditation_id" = l."version_default_meditation_id",
    "version_starting_soon_meditation_id" = l."version_starting_soon_meditation_id",
    "version_live_now_meditation_id" = l."version_live_now_meditation_id"
    FROM "_app_cards_v_locales" AS l
   WHERE l."_parent_id" = v."id" AND l."_locale" = 'en';

  UPDATE "forms_blocks_select" AS s SET "placeholder" = l."placeholder"
    FROM "forms_blocks_select_locales" AS l
   WHERE l."_parent_id" = s."id" AND l."_locale" = 'en';

  UPDATE "forms" AS f SET "title" = l."title", "redirect_url" = l."redirect_url" FROM (
    SELECT DISTINCT ON ("_parent_id") "_parent_id", "title", "redirect_url"
      FROM "forms_locales" ORDER BY "_parent_id", ("_locale" = 'en') DESC, "id") AS l
   WHERE l."_parent_id" = f."id";

  ALTER TABLE "forms" ALTER COLUMN "title" SET NOT NULL;`)

  await db.execute(sql`
   ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_default_meditation_id_meditations_id_fk" FOREIGN KEY ("default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "app_cards" ADD CONSTRAINT "app_cards_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_default_meditation_id_meditations_id_fk" FOREIGN KEY ("version_default_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_starting_soon_meditation_id_meditations_id_fk" FOREIGN KEY ("version_starting_soon_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_app_cards_v" ADD CONSTRAINT "_app_cards_v_version_live_now_meditation_id_meditations_id_fk" FOREIGN KEY ("version_live_now_meditation_id") REFERENCES "public"."meditations"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "app_cards_default_default_meditation_idx" ON "app_cards" USING btree ("default_meditation_id");
  CREATE INDEX "app_cards_starting_soon_starting_soon_meditation_idx" ON "app_cards" USING btree ("starting_soon_meditation_id");
  CREATE INDEX "app_cards_live_now_live_now_meditation_idx" ON "app_cards" USING btree ("live_now_meditation_id");
  CREATE INDEX "_app_cards_v_version_default_version_default_meditation_idx" ON "_app_cards_v" USING btree ("version_default_meditation_id");
  CREATE INDEX "_app_cards_v_version_starting_soon_version_starting_so_4_idx" ON "_app_cards_v" USING btree ("version_starting_soon_meditation_id");
  CREATE INDEX "_app_cards_v_version_live_now_version_live_now_meditatio_idx" ON "_app_cards_v" USING btree ("version_live_now_meditation_id");
  ALTER TABLE "videos_locales" DROP COLUMN "subtitles";
  ALTER TABLE "app_cards_locales" DROP COLUMN "default_meditation_id";
  ALTER TABLE "app_cards_locales" DROP COLUMN "starting_soon_meditation_id";
  ALTER TABLE "app_cards_locales" DROP COLUMN "live_now_meditation_id";
  ALTER TABLE "_app_cards_v_locales" DROP COLUMN "version_default_meditation_id";
  ALTER TABLE "_app_cards_v_locales" DROP COLUMN "version_starting_soon_meditation_id";
  ALTER TABLE "_app_cards_v_locales" DROP COLUMN "version_live_now_meditation_id";
  ALTER TABLE "forms_blocks_select_locales" DROP COLUMN "placeholder";
  ALTER TABLE "forms_locales" DROP COLUMN "title";
  ALTER TABLE "forms_locales" DROP COLUMN "redirect_url";`)
}
