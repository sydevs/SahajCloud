import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_app_translations_locales" RENAME COLUMN "profile_privacy_advertising" TO "profile_privacy";
  ALTER TABLE "wm_app_translations_locales" RENAME COLUMN "profile_privacy_advertising_advertising_body_never_share" TO "profile_privacy_advertising_body_never_share";
  ALTER TABLE "wm_app_translations_locales" RENAME COLUMN "profile_privacy_advertising_advertising_body_intro" TO "profile_privacy_advertising_body_intro";
  ALTER TABLE "_wm_app_translations_v_locales" RENAME COLUMN "version_profile_privacy_advertising" TO "version_profile_privacy";
  ALTER TABLE "_wm_app_translations_v_locales" RENAME COLUMN "version_profile_privacy_advertising_advertising_body_never_share" TO "version_profile_privacy_advertising_body_never_share";
  ALTER TABLE "_wm_app_translations_v_locales" RENAME COLUMN "version_profile_privacy_advertising_advertising_body_intro" TO "version_profile_privacy_advertising_body_intro";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "wm_app_translations_locales" RENAME COLUMN "profile_privacy" TO "profile_privacy_advertising";
  ALTER TABLE "wm_app_translations_locales" RENAME COLUMN "profile_privacy_advertising_body_never_share" TO "profile_privacy_advertising_advertising_body_never_share";
  ALTER TABLE "wm_app_translations_locales" RENAME COLUMN "profile_privacy_advertising_body_intro" TO "profile_privacy_advertising_advertising_body_intro";
  ALTER TABLE "_wm_app_translations_v_locales" RENAME COLUMN "version_profile_privacy" TO "version_profile_privacy_advertising";
  ALTER TABLE "_wm_app_translations_v_locales" RENAME COLUMN "version_profile_privacy_advertising_body_never_share" TO "version_profile_privacy_advertising_advertising_body_never_share";
  ALTER TABLE "_wm_app_translations_v_locales" RENAME COLUMN "version_profile_privacy_advertising_body_intro" TO "version_profile_privacy_advertising_advertising_body_intro";`)
}
