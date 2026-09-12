/**
 * Sahaj Atlas translations, regrouped by widget view (#706).
 *
 * The DDL below is generated. The `UPDATE` block at the end of each direction
 * is **the one hand-edit**, and it is deliberate:
 *
 * `event_recurrence`, `registration_form` and `share` keep their columns but
 * get a new key set. Since #705 each JSON column validates against its own
 * schema on every save of the global, and unknown keys are rejected — so a
 * locale still holding an old-shape blob would become unsaveable from the
 * admin, on a save that never touched translations. The seed writes these
 * three groups for the ten widget locales, but not for the other nine, and
 * only the stored value can strand them.
 *
 * **It drops the keys, not the column.** Each `UPDATE` keeps every key the
 * direction it moves toward still declares, and removes only the rest. So a
 * translated value a manager typed survives wherever its key survives — 10 of
 * `registration_form`'s 14 and 8 of `event_recurrence`'s 11 — and the copy
 * that is lost is exactly the copy under a key #706 deletes from the
 * catalogue outright: `share.action`, `registration.form.{cancel,
 * mailing_list_consent, register_now, thank_you}` and
 * `event.recurrence.{weekly, monthly, no_recurrence}`. Nulling the whole
 * column, as the first draft did, would have destroyed the other 18 too.
 *
 * `jsonb_object_agg` over no surviving key yields NULL, which is what an
 * emptied column should be. The `jsonb_typeof` guard is load-bearing:
 * `jsonb_each` raises `cannot call jsonb_each on a non-object` on a column
 * holding a scalar or an array, which would abort the whole migration.
 *
 * The two columns that hold live production data — `emails` and
 * `event_title` — are untouched by this migration, in both directions.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common_chrome" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common_settings" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common_errors" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common_report" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common_report_errors" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common_map" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common_feedback" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "countries" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "search_chrome" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "search_results" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "search_sort" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "search_country_site" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "search_nearby_prompt" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_chrome" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_format" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_cadence" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_days" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_time" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_language" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_dates" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "filters_region" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "online" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_display" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_actions" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "calendar" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "compact" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common_chrome" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common_settings" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common_errors" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common_report" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common_report_errors" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common_map" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common_feedback" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_countries" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_search_chrome" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_search_results" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_search_sort" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_search_country_site" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_search_nearby_prompt" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_chrome" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_format" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_cadence" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_days" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_time" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_language" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_dates" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_filters_region" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_online" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_display" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_actions" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_calendar" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_compact" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "region_locations";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "region_venues";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_details";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_timing";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_region_locations";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_region_venues";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_details";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_timing";`)

  // The one hand-edit — see the file header. Three kept columns get a new key
  // set, and an old-shape blob left in a locale the seed does not write would
  // fail the column's own schema validation on the next save of the global.
  // Each key the NEW schema still declares is kept, with its stored value.
  await db.execute(sql`
  UPDATE "sy_atlas_translations_locales"
     SET "event_recurrence" = CASE WHEN jsonb_typeof("event_recurrence") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("event_recurrence") AS e(k, v)
            WHERE k IN ('daily', 'daily_n', 'weekly_1', 'weekly_2', 'weekly_n', 'weekly_multi', 'monthly_1st', 'monthly_2nd', 'monthly_3rd', 'monthly_4th', 'monthly_last', 'monthly_date')) END,
         "registration_form" = CASE WHEN jsonb_typeof("registration_form") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("registration_form") AS e(k, v)
            WHERE k IN ('title', 'name', 'email', 'starting_date', 'show_more_dates', 'submit', 'okay', 'followup', 'invite_friend', 'online_notice', 'online_notice_title', 'privacy_policy', 'error_title', 'captcha_retry')) END,
         "share" = CASE WHEN jsonb_typeof("share") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("share") AS e(k, v)
            WHERE k IN ('title', 'share_on', 'native', 'copy_link', 'copied')) END;
  UPDATE "_sy_atlas_translations_v_locales"
     SET "version_event_recurrence" = CASE WHEN jsonb_typeof("version_event_recurrence") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("version_event_recurrence") AS e(k, v)
            WHERE k IN ('daily', 'daily_n', 'weekly_1', 'weekly_2', 'weekly_n', 'weekly_multi', 'monthly_1st', 'monthly_2nd', 'monthly_3rd', 'monthly_4th', 'monthly_last', 'monthly_date')) END,
         "version_registration_form" = CASE WHEN jsonb_typeof("version_registration_form") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("version_registration_form") AS e(k, v)
            WHERE k IN ('title', 'name', 'email', 'starting_date', 'show_more_dates', 'submit', 'okay', 'followup', 'invite_friend', 'online_notice', 'online_notice_title', 'privacy_policy', 'error_title', 'captcha_retry')) END,
         "version_share" = CASE WHEN jsonb_typeof("version_share") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("version_share") AS e(k, v)
            WHERE k IN ('title', 'share_on', 'native', 'copy_link', 'copied')) END;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "common" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "region_locations" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "region_venues" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_details" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" ADD COLUMN "event_timing" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_common" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_region_locations" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_region_venues" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_details" jsonb;
  ALTER TABLE "_sy_atlas_translations_v_locales" ADD COLUMN "version_event_timing" jsonb;
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common_chrome";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common_settings";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common_errors";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common_report";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common_report_errors";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common_map";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "common_feedback";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "countries";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "search_chrome";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "search_results";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "search_sort";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "search_country_site";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "search_nearby_prompt";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_chrome";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_format";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_cadence";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_days";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_time";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_language";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_dates";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "filters_region";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "online";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_display";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "event_actions";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "calendar";
  ALTER TABLE "sy_atlas_translations_locales" DROP COLUMN "compact";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common_chrome";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common_settings";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common_errors";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common_report";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common_report_errors";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common_map";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_common_feedback";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_countries";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_search_chrome";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_search_results";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_search_sort";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_search_country_site";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_search_nearby_prompt";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_chrome";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_format";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_cadence";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_days";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_time";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_language";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_dates";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_filters_region";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_online";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_display";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_event_actions";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_calendar";
  ALTER TABLE "_sy_atlas_translations_v_locales" DROP COLUMN "version_compact";`)

  // The mirror of `up`'s one hand-edit, and needed for the same reason. By the
  // time this runs those three columns hold the NEW key sets, which the old
  // schema rejects just as flatly — so a rollback without this leaves every
  // seeded locale unsaveable. Here the OLD key set is what survives, so a
  // value that came through `up` under a shared key comes back through `down`.
  await db.execute(sql`
  UPDATE "sy_atlas_translations_locales"
     SET "event_recurrence" = CASE WHEN jsonb_typeof("event_recurrence") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("event_recurrence") AS e(k, v)
            WHERE k IN ('daily', 'weekly', 'monthly', 'weekly_1', 'weekly_2', 'monthly_1st', 'monthly_2nd', 'monthly_3rd', 'monthly_4th', 'monthly_last', 'no_recurrence')) END,
         "registration_form" = CASE WHEN jsonb_typeof("registration_form") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("registration_form") AS e(k, v)
            WHERE k IN ('cancel', 'email', 'followup', 'invite_friend', 'mailing_list_consent', 'name', 'okay', 'online_notice', 'online_notice_title', 'privacy_policy', 'register_now', 'starting_date', 'submit', 'thank_you')) END,
         "share" = CASE WHEN jsonb_typeof("share") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("share") AS e(k, v)
            WHERE k IN ('action')) END;
  UPDATE "_sy_atlas_translations_v_locales"
     SET "version_event_recurrence" = CASE WHEN jsonb_typeof("version_event_recurrence") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("version_event_recurrence") AS e(k, v)
            WHERE k IN ('daily', 'weekly', 'monthly', 'weekly_1', 'weekly_2', 'monthly_1st', 'monthly_2nd', 'monthly_3rd', 'monthly_4th', 'monthly_last', 'no_recurrence')) END,
         "version_registration_form" = CASE WHEN jsonb_typeof("version_registration_form") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("version_registration_form") AS e(k, v)
            WHERE k IN ('cancel', 'email', 'followup', 'invite_friend', 'mailing_list_consent', 'name', 'okay', 'online_notice', 'online_notice_title', 'privacy_policy', 'register_now', 'starting_date', 'submit', 'thank_you')) END,
         "version_share" = CASE WHEN jsonb_typeof("version_share") = 'object' THEN (
           SELECT jsonb_object_agg(k, v) FROM jsonb_each("version_share") AS e(k, v)
            WHERE k IN ('action')) END;`)
}
