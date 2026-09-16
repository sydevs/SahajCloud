import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_user_submissions_status" ADD VALUE 'spam' BEFORE 'failed';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DEFAULT 'pending'::text;
  DROP TYPE "public"."enum_user_submissions_status";
  CREATE TYPE "public"."enum_user_submissions_status" AS ENUM('pending', 'accepted', 'rejected', 'failed');
  ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."enum_user_submissions_status";
  ALTER TABLE "user_submissions" ALTER COLUMN "status" SET DATA TYPE "public"."enum_user_submissions_status" USING "status"::"public"."enum_user_submissions_status";`)
}
