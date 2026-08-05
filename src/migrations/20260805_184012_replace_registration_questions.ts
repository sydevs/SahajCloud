import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ADD COLUMN "registration_questions_experience" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_referral" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_aspirations" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_questions" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_experience" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_referral" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_aspirations" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_questions" boolean;
  ALTER TABLE "events" DROP COLUMN "registration_questions_prior_experience";
  ALTER TABLE "events" DROP COLUMN "registration_questions_referral_source";
  ALTER TABLE "events" DROP COLUMN "registration_questions_health_info";
  ALTER TABLE "events" DROP COLUMN "registration_questions_accessibility";
  ALTER TABLE "events" DROP COLUMN "registration_questions_guests";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_prior_experience";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_referral_source";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_health_info";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_accessibility";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_guests";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events" ADD COLUMN "registration_questions_prior_experience" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_referral_source" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_health_info" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_accessibility" boolean;
  ALTER TABLE "events" ADD COLUMN "registration_questions_guests" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_prior_experience" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_referral_source" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_health_info" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_accessibility" boolean;
  ALTER TABLE "_events_v" ADD COLUMN "version_registration_questions_guests" boolean;
  ALTER TABLE "events" DROP COLUMN "registration_questions_experience";
  ALTER TABLE "events" DROP COLUMN "registration_questions_referral";
  ALTER TABLE "events" DROP COLUMN "registration_questions_aspirations";
  ALTER TABLE "events" DROP COLUMN "registration_questions_questions";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_experience";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_referral";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_aspirations";
  ALTER TABLE "_events_v" DROP COLUMN "version_registration_questions_questions";`)
}
