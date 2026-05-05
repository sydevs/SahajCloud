import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`UPDATE \`audiences\` SET \`type\` = 'context' WHERE \`type\` = 'condition'`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`UPDATE \`audiences\` SET \`type\` = 'condition' WHERE \`type\` = 'context'`)
}
