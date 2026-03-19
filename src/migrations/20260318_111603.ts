import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`meditations\` ADD \`duration\` numeric;`)
  await db.run(sql`ALTER TABLE \`meditations\` DROP COLUMN \`file_metadata\`;`)
  await db.run(sql`ALTER TABLE \`meditations\` DROP COLUMN \`duration_minutes\`;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` ADD \`version_duration\` numeric;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` DROP COLUMN \`version_file_metadata\`;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` DROP COLUMN \`version_duration_minutes\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`meditations\` ADD \`file_metadata\` text;`)
  await db.run(sql`ALTER TABLE \`meditations\` ADD \`duration_minutes\` numeric;`)
  await db.run(sql`ALTER TABLE \`meditations\` DROP COLUMN \`duration\`;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` ADD \`version_file_metadata\` text;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` ADD \`version_duration_minutes\` numeric;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` DROP COLUMN \`version_duration\`;`)
}
