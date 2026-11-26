import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261120_235118_lecture_date already adds "lectures"."date", and
 * 20261123_185218_pages_parent_index_pages carries a later timestamp from a parallel
 * branch, so the newest snapshot on disk described a schema without that column. The
 * next migrate:create would have diffed against it and re-emitted the same ADD COLUMN,
 * which aborts the boot migration on a database that already ran it (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
