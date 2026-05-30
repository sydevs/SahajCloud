import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

type MigrationDB = MigrateUpArgs['db']
type SQLStatement = ReturnType<typeof sql>
type TableInfoRow = {
  name: string
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

async function columnExists(
  db: MigrationDB,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const columns = await db.all<TableInfoRow>(
    sql.raw(`PRAGMA table_info(${quoteIdentifier(tableName)})`),
  )
  return columns.some((column) => column.name === columnName)
}

async function addColumnIfMissing(
  db: MigrationDB,
  tableName: string,
  columnName: string,
  statement: SQLStatement,
): Promise<void> {
  if (await columnExists(db, tableName, columnName)) return
  await db.run(statement)
}

async function dropColumnIfExists(
  db: MigrationDB,
  tableName: string,
  columnName: string,
  statement: SQLStatement,
): Promise<void> {
  if (!(await columnExists(db, tableName, columnName))) return
  await db.run(statement)
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addColumnIfMissing(
    db,
    'wm_app_config',
    'explore_deeper_page_id',
    sql`ALTER TABLE \`wm_app_config\` ADD \`explore_deeper_page_id\` integer REFERENCES pages(id);`,
  )
  await addColumnIfMissing(
    db,
    'wm_app_config',
    'meditate_together_page_id',
    sql`ALTER TABLE \`wm_app_config\` ADD \`meditate_together_page_id\` integer REFERENCES pages(id);`,
  )
  if (!(await columnExists(db, 'wm_app_config', 'lessons_page_id'))) {
    await addColumnIfMissing(
      db,
      'wm_app_config',
      'path_page_id',
      sql`ALTER TABLE \`wm_app_config\` ADD \`path_page_id\` integer REFERENCES pages(id);`,
    )
  }
  await addColumnIfMissing(
    db,
    'wm_app_config',
    'music_page_id',
    sql`ALTER TABLE \`wm_app_config\` ADD \`music_page_id\` integer REFERENCES pages(id);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_explore_deeper_page_idx\` ON \`wm_app_config\` (\`explore_deeper_page_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_meditate_together_page_idx\` ON \`wm_app_config\` (\`meditate_together_page_id\`);`,
  )
  if (await columnExists(db, 'wm_app_config', 'path_page_id')) {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_path_page_idx\` ON \`wm_app_config\` (\`path_page_id\`);`,
    )
  }
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_music_page_idx\` ON \`wm_app_config\` (\`music_page_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_explore_deeper_page_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_meditate_together_page_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_lessons_page_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_path_page_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_music_page_idx\`;`)
  await dropColumnIfExists(
    db,
    'wm_app_config',
    'explore_deeper_page_id',
    sql`ALTER TABLE \`wm_app_config\` DROP COLUMN \`explore_deeper_page_id\`;`,
  )
  await dropColumnIfExists(
    db,
    'wm_app_config',
    'meditate_together_page_id',
    sql`ALTER TABLE \`wm_app_config\` DROP COLUMN \`meditate_together_page_id\`;`,
  )
  await dropColumnIfExists(
    db,
    'wm_app_config',
    'lessons_page_id',
    sql`ALTER TABLE \`wm_app_config\` DROP COLUMN \`lessons_page_id\`;`,
  )
  await dropColumnIfExists(
    db,
    'wm_app_config',
    'path_page_id',
    sql`ALTER TABLE \`wm_app_config\` DROP COLUMN \`path_page_id\`;`,
  )
  await dropColumnIfExists(
    db,
    'wm_app_config',
    'music_page_id',
    sql`ALTER TABLE \`wm_app_config\` DROP COLUMN \`music_page_id\`;`,
  )
}
