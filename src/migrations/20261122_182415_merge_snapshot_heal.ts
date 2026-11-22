import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * No DDL. This migration exists for its snapshot alone.
 *
 * 20261120_231045_add_pages_public_channels already adds the four channel columns and
 * their indexes, and main's 20261121_035055 and 20261121_035100 carry later timestamps,
 * so the newest snapshot on disk described a schema that never held them. The next
 * migrate:create would have diffed against that and re-emitted all eight statements,
 * which abort the boot migration on a database that already ran them (#566).
 *
 * This file's .json was generated on the merged tree, so it is the first snapshot that
 * describes both branches. Keep the timestamp: it is what makes it newest.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
