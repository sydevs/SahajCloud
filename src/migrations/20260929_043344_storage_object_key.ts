import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "meditations" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "_meditations_v" ADD COLUMN "version__objectkey" varchar;
  ALTER TABLE "songs" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "videos" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "frames" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "images" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "files" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "user_choices" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "song_tags" ADD COLUMN "_objectkey" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "meditations" DROP COLUMN "_objectkey";
  ALTER TABLE "_meditations_v" DROP COLUMN "version__objectkey";
  ALTER TABLE "songs" DROP COLUMN "_objectkey";
  ALTER TABLE "videos" DROP COLUMN "_objectkey";
  ALTER TABLE "frames" DROP COLUMN "_objectkey";
  ALTER TABLE "images" DROP COLUMN "_objectkey";
  ALTER TABLE "files" DROP COLUMN "_objectkey";
  ALTER TABLE "user_choices" DROP COLUMN "_objectkey";
  ALTER TABLE "song_tags" DROP COLUMN "_objectkey";`)
}
