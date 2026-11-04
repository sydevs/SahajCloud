import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "user_submissions_sender_email_idx";
  ALTER TABLE "user_submissions" DROP COLUMN "sender_email";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" ADD COLUMN "sender_email" varchar;
  CREATE INDEX "user_submissions_sender_email_idx" ON "user_submissions" USING btree ("sender_email");`)
}
