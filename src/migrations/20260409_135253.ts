import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`start_time\` numeric DEFAULT 0 NOT NULL;`)
  await db.run(sql`ALTER TABLE \`lectures\` ADD \`end_time\` numeric DEFAULT 600 NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`lectures\` DROP COLUMN \`start_time\`;`)
  await db.run(sql`ALTER TABLE \`lectures\` DROP COLUMN \`end_time\`;`)
}
