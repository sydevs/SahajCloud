import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Snapshot only: no DDL. The fourth `main` merge carrying a migration brought
 * `20261106_094841_clients_one_site`, whose timestamp is older than the newest
 * snapshot on this branch — so `migrate:create` diffed against a snapshot that
 * knew nothing of it and re-emitted its whole `clients` reshape, down to
 * `DROP TABLE "_clients_v" CASCADE`. Every statement it emitted is already
 * shipped by `20261106_094841`, and replaying one aborts the boot migration. So
 * the file keeps only its `.json` snapshot, generated on the merged tree, which
 * heals the chain (`src/migrations/AGENTS.md`, "The out-of-order snapshot
 * trap").
 *
 * This is the only such heal left on the branch: an earlier one heals the chain
 * as it stood and is superseded the moment a newer snapshot lands, so the three
 * before this one were dropped rather than kept.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
