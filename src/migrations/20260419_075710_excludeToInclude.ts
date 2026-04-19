import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`songs\` ADD \`include_for_meditations\` integer DEFAULT true;`)
  await db.run(
    sql`UPDATE \`songs\` SET \`include_for_meditations\` = CASE WHEN \`exclude_from_meditations\` = 1 THEN 0 ELSE 1 END;`,
  )
  await db.run(sql`ALTER TABLE \`songs\` DROP COLUMN \`exclude_from_meditations\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`songs\` ADD \`exclude_from_meditations\` integer DEFAULT false;`)
  await db.run(
    sql`UPDATE \`songs\` SET \`exclude_from_meditations\` = CASE WHEN \`include_for_meditations\` = 0 THEN 1 ELSE 0 END;`,
  )
  await db.run(sql`ALTER TABLE \`songs\` DROP COLUMN \`include_for_meditations\`;`)
}
