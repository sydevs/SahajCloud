import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * Merging `main` in brought two data-only migrations, 20261125_213000_atlas_common_copied and
 * 20261125_230000_atlas_drop_captcha_blocked, whose `.json` is the prior snapshot on `main`
 * re-stamped — a schema holding none of this branch's columns, and newest by timestamp. So the
 * next migrate:create re-emitted the page-tag enums and tables of
 * 20261122_213242_add_service_page_tags and the reminder-page column, constraint and index of
 * 20261123_001950_add_app_live_reminder_page, statements that abort the boot migration on a
 * database that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes every branch. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
