import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`
    UPDATE \`pages_locales\`
    SET \`content\` = REPLACE(\`content\`, '"style":"columns"', '"style":"tabs"')
    WHERE \`content\` LIKE '%"style":"columns"%';
  `)
  await db.run(sql`
    UPDATE \`_pages_v_locales\`
    SET \`version_content\` = REPLACE(\`version_content\`, '"style":"columns"', '"style":"tabs"')
    WHERE \`version_content\` LIKE '%"style":"columns"%';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`
    UPDATE \`pages_locales\`
    SET \`content\` = REPLACE(\`content\`, '"style":"tabs"', '"style":"columns"')
    WHERE \`content\` LIKE '%"style":"tabs"%';
  `)
  await db.run(sql`
    UPDATE \`_pages_v_locales\`
    SET \`version_content\` = REPLACE(\`version_content\`, '"style":"tabs"', '"style":"columns"')
    WHERE \`version_content\` LIKE '%"style":"tabs"%';
  `)
}
