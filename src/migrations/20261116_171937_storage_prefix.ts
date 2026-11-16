import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "meditations" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "_meditations_v" ADD COLUMN "version_prefix" varchar DEFAULT '';
  ALTER TABLE "songs" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "videos" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "frames" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "images" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "files" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "user_choices" ADD COLUMN "prefix" varchar DEFAULT '';
  ALTER TABLE "song_tags" ADD COLUMN "prefix" varchar DEFAULT '';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "meditations" DROP COLUMN "prefix";
  ALTER TABLE "_meditations_v" DROP COLUMN "version_prefix";
  ALTER TABLE "songs" DROP COLUMN "prefix";
  ALTER TABLE "videos" DROP COLUMN "prefix";
  ALTER TABLE "frames" DROP COLUMN "prefix";
  ALTER TABLE "images" DROP COLUMN "prefix";
  ALTER TABLE "files" DROP COLUMN "prefix";
  ALTER TABLE "user_choices" DROP COLUMN "prefix";
  ALTER TABLE "song_tags" DROP COLUMN "prefix";`)
}
