import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`managers\` ADD \`type\` text DEFAULT 'manager' NOT NULL;`)
  await db.run(sql`ALTER TABLE \`managers\` DROP COLUMN \`admin\`;`)
  await db.run(sql`ALTER TABLE \`managers\` DROP COLUMN \`active\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`managers\` ADD \`admin\` integer DEFAULT false;`)
  await db.run(sql`ALTER TABLE \`managers\` ADD \`active\` integer DEFAULT true;`)
  await db.run(sql`ALTER TABLE \`managers\` DROP COLUMN \`type\`;`)
}
