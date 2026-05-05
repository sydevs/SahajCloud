import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`UPDATE \`lectures\` SET \`priority\` = 0 WHERE \`priority\` IS NULL;`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // No-op: reverting a NULL → 0 backfill would require knowing which rows were originally NULL,
  // which we don't track. The previous migration's down() drops the column entirely if needed.
}
