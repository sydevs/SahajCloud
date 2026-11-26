import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// SET NOT NULL aborts the boot migration on a row still holding NULL, so
// 20261123_002000's fill runs again beside it: a database that applied that one
// before any page carried the slug still holds NULL. The two go in separate
// calls because a parameterized statement carries one command, not two.

const SLUG = 'live-meditations-reminder'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "wm_app_config" SET "live_meditations_reminder_page_id" = (
      SELECT "id" FROM "pages" WHERE "slug" = ${SLUG} AND "deleted_at" IS NULL ORDER BY "id" LIMIT 1
    )
    WHERE "live_meditations_reminder_page_id" IS NULL`)
  await db.execute(sql`
   ALTER TABLE "wm_app_config" ALTER COLUMN "live_meditations_reminder_page_id" SET NOT NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_app_config" ALTER COLUMN "live_meditations_reminder_page_id" DROP NOT NULL;`)
}
