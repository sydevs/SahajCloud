import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_events_verification_stage" ADD VALUE 'urgent' BEFORE 'expired';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DATA TYPE text;
  ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DEFAULT 'verified'::text;
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DATA TYPE text;
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DEFAULT 'verified'::text;
  DROP TYPE "public"."enum_events_verification_stage";
  CREATE TYPE "public"."enum_events_verification_stage" AS ENUM('verified', 'reminded', 'escalated', 'expired', 'finished');
  ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DEFAULT 'verified'::"public"."enum_events_verification_stage";
  ALTER TABLE "events" ALTER COLUMN "verification_stage" SET DATA TYPE "public"."enum_events_verification_stage" USING "verification_stage"::"public"."enum_events_verification_stage";
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DEFAULT 'verified'::"public"."enum_events_verification_stage";
  ALTER TABLE "_events_v" ALTER COLUMN "version_verification_stage" SET DATA TYPE "public"."enum_events_verification_stage" USING "version_verification_stage"::"public"."enum_events_verification_stage";`)
}
