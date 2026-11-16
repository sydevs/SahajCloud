import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "pages_locales_parent_id_idx" ON "pages_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_locales_parent_id_idx" ON "_pages_v_locales" USING btree ("_parent_id");
  CREATE INDEX "songs_locales_parent_id_idx" ON "songs_locales" USING btree ("_parent_id");
  CREATE INDEX "albums_locales_parent_id_idx" ON "albums_locales" USING btree ("_parent_id");
  CREATE INDEX "videos_locales_parent_id_idx" ON "videos_locales" USING btree ("_parent_id");
  CREATE INDEX "lessons_locales_parent_id_idx" ON "lessons_locales" USING btree ("_parent_id");
  CREATE INDEX "lectures_locales_parent_id_idx" ON "lectures_locales" USING btree ("_parent_id");
  CREATE INDEX "authors_locales_parent_id_idx" ON "authors_locales" USING btree ("_parent_id");
  CREATE INDEX "images_locales_parent_id_idx" ON "images_locales" USING btree ("_parent_id");
  CREATE INDEX "user_choices_locales_parent_id_idx" ON "user_choices_locales" USING btree ("_parent_id");
  CREATE INDEX "song_tags_locales_parent_id_idx" ON "song_tags_locales" USING btree ("_parent_id");
  CREATE INDEX "app_cards_locales_parent_id_idx" ON "app_cards_locales" USING btree ("_parent_id");
  CREATE INDEX "_app_cards_v_locales_parent_id_idx" ON "_app_cards_v_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_checkbox_locales_parent_id_idx" ON "forms_blocks_checkbox_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_country_locales_parent_id_idx" ON "forms_blocks_country_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_email_locales_parent_id_idx" ON "forms_blocks_email_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_message_locales_parent_id_idx" ON "forms_blocks_message_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_number_locales_parent_id_idx" ON "forms_blocks_number_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_select_options_locales_parent_id_idx" ON "forms_blocks_select_options_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_select_locales_parent_id_idx" ON "forms_blocks_select_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_state_locales_parent_id_idx" ON "forms_blocks_state_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_text_locales_parent_id_idx" ON "forms_blocks_text_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_blocks_textarea_locales_parent_id_idx" ON "forms_blocks_textarea_locales" USING btree ("_parent_id");
  CREATE INDEX "forms_locales_parent_id_idx" ON "forms_locales" USING btree ("_parent_id");
  CREATE INDEX "wm_web_translations_locales_parent_id_idx" ON "wm_web_translations_locales" USING btree ("_parent_id");
  CREATE INDEX "_wm_web_translations_v_locales_parent_id_idx" ON "_wm_web_translations_v_locales" USING btree ("_parent_id");
  CREATE INDEX "wm_app_config_locales_parent_id_idx" ON "wm_app_config_locales" USING btree ("_parent_id");
  CREATE INDEX "wm_app_translations_locales_parent_id_idx" ON "wm_app_translations_locales" USING btree ("_parent_id");
  CREATE INDEX "_wm_app_translations_v_locales_parent_id_idx" ON "_wm_app_translations_v_locales" USING btree ("_parent_id");
  CREATE INDEX "wm_app_status_locales_parent_id_idx" ON "wm_app_status_locales" USING btree ("_parent_id");
  CREATE INDEX "sy_atlas_translations_locales_parent_id_idx" ON "sy_atlas_translations_locales" USING btree ("_parent_id");
  CREATE INDEX "_sy_atlas_translations_v_locales_parent_id_idx" ON "_sy_atlas_translations_v_locales" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "pages_locales_parent_id_idx";
  DROP INDEX "_pages_v_locales_parent_id_idx";
  DROP INDEX "songs_locales_parent_id_idx";
  DROP INDEX "albums_locales_parent_id_idx";
  DROP INDEX "videos_locales_parent_id_idx";
  DROP INDEX "lessons_locales_parent_id_idx";
  DROP INDEX "lectures_locales_parent_id_idx";
  DROP INDEX "authors_locales_parent_id_idx";
  DROP INDEX "images_locales_parent_id_idx";
  DROP INDEX "user_choices_locales_parent_id_idx";
  DROP INDEX "song_tags_locales_parent_id_idx";
  DROP INDEX "app_cards_locales_parent_id_idx";
  DROP INDEX "_app_cards_v_locales_parent_id_idx";
  DROP INDEX "forms_blocks_checkbox_locales_parent_id_idx";
  DROP INDEX "forms_blocks_country_locales_parent_id_idx";
  DROP INDEX "forms_blocks_email_locales_parent_id_idx";
  DROP INDEX "forms_blocks_message_locales_parent_id_idx";
  DROP INDEX "forms_blocks_number_locales_parent_id_idx";
  DROP INDEX "forms_blocks_select_options_locales_parent_id_idx";
  DROP INDEX "forms_blocks_select_locales_parent_id_idx";
  DROP INDEX "forms_blocks_state_locales_parent_id_idx";
  DROP INDEX "forms_blocks_text_locales_parent_id_idx";
  DROP INDEX "forms_blocks_textarea_locales_parent_id_idx";
  DROP INDEX "forms_locales_parent_id_idx";
  DROP INDEX "wm_web_translations_locales_parent_id_idx";
  DROP INDEX "_wm_web_translations_v_locales_parent_id_idx";
  DROP INDEX "wm_app_config_locales_parent_id_idx";
  DROP INDEX "wm_app_translations_locales_parent_id_idx";
  DROP INDEX "_wm_app_translations_v_locales_parent_id_idx";
  DROP INDEX "wm_app_status_locales_parent_id_idx";
  DROP INDEX "sy_atlas_translations_locales_parent_id_idx";
  DROP INDEX "_sy_atlas_translations_v_locales_parent_id_idx";`)
}
