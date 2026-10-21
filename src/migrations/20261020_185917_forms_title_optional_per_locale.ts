import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * `forms.title` stops being `required` once it is localized (#981), because
 * Payload validates a required localized field against that locale's own
 * value — so its column stops being `NOT NULL`.
 *
 * Stacked rather than folded into
 * `20261020_170450_localize_admin_edited_fields`, which has already deployed
 * to this PR's Railway preview. Reshaping a migration that has run leaves the
 * columns in place with no `payload_migrations` row naming the new one, and
 * the boot migration then crash-loops on its first statement (#633,
 * `src/migrations/AGENTS.md`).
 *
 * ⚠ **Trimmed: the generated delta re-emitted four `lessons` statements** —
 * `lessons_panels._locale`, `lessons_locales.title`, that index, and the
 * `lessons.title` drop. All four already ship in
 * `20261017_093546_localize_lesson_title_and_panels`, which landed on `main`
 * after this branch was cut, so the newest snapshot did not hold them and the
 * diff read them as new. The `.json` beside this file is kept exactly as
 * generated: taken on the merged tree, it is what makes the newest snapshot
 * whole again, which is the whole point of healing this rather than deleting
 * it (AGENTS.md, the out-of-order snapshot trap).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "forms_locales" ALTER COLUMN "title" DROP NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  -- A row written while the column was nullable still has to satisfy the
  -- restored constraint, and this table holds no other source to read from.
  UPDATE "forms_locales" SET "title" = '' WHERE "title" IS NULL;
  ALTER TABLE "forms_locales" ALTER COLUMN "title" SET NOT NULL;`)
}
