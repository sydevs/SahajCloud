import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

type MigrationDB = MigrateUpArgs['db']
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

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const hasPathColumn = await columnExists(db, 'wm_app_config', 'path_page_id')
  const hasLessonsColumn = await columnExists(db, 'wm_app_config', 'lessons_page_id')

  if (hasPathColumn && !hasLessonsColumn) {
    await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_path_page_idx\`;`)
    await db.run(
      sql`ALTER TABLE \`wm_app_config\` RENAME COLUMN \`path_page_id\` TO \`lessons_page_id\`;`,
    )
  }

  if (!hasPathColumn && !hasLessonsColumn) {
    await db.run(
      sql`ALTER TABLE \`wm_app_config\` ADD \`lessons_page_id\` integer REFERENCES pages(id);`,
    )
  }

  await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_path_page_idx\`;`)
  if (await columnExists(db, 'wm_app_config', 'lessons_page_id')) {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_lessons_page_idx\` ON \`wm_app_config\` (\`lessons_page_id\`);`,
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const hasPathColumn = await columnExists(db, 'wm_app_config', 'path_page_id')
  const hasLessonsColumn = await columnExists(db, 'wm_app_config', 'lessons_page_id')

  if (hasLessonsColumn && !hasPathColumn) {
    await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_lessons_page_idx\`;`)
    await db.run(
      sql`ALTER TABLE \`wm_app_config\` RENAME COLUMN \`lessons_page_id\` TO \`path_page_id\`;`,
    )
  }

  await db.run(sql`DROP INDEX IF EXISTS \`wm_app_config_lessons_page_idx\`;`)
  if (await columnExists(db, 'wm_app_config', 'path_page_id')) {
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS \`wm_app_config_path_page_idx\` ON \`wm_app_config\` (\`path_page_id\`);`,
    )
  }
}
