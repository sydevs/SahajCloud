import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

import { recomputeWeightsForMeditation } from '@/lib/meditations/nodeWeights'
import type { Meditation } from '@/payload-types'

type MigrationDb = MigrateUpArgs['db']
type MigrationTable = 'meditations' | '_meditations_v'

async function columnExists(
  db: MigrationDb,
  table: MigrationTable,
  column: string,
): Promise<boolean> {
  const rows = await db.all<{ name: string }>(sql.raw(`PRAGMA table_info(\`${table}\`);`))
  return rows.some((row) => row.name === column)
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  if (!(await columnExists(db, 'meditations', 'subtle_system_node_weights'))) {
    await db.run(sql`ALTER TABLE \`meditations\` ADD \`subtle_system_node_weights\` text;`)
  }
  if (!(await columnExists(db, '_meditations_v', 'version_subtle_system_node_weights'))) {
    await db.run(sql`ALTER TABLE \`_meditations_v\` ADD \`version_subtle_system_node_weights\` text;`)
  }

  // Backfill: walk every meditation and compute on-screen-time weights from its
  // frames + duration via the same helper the runtime uses. Persist directly so
  // legacy production rows with incomplete publishing fields are not revalidated
  // by Payload while we are only hydrating this hidden cache column.
  const { docs } = await payload.find({
    collection: 'meditations',
    limit: 0,
    pagination: false,
    depth: 0,
    locale: 'all',
    req,
  })

  for (const med of docs as Meditation[]) {
    const weights = await recomputeWeightsForMeditation(payload, med, req)
    await db.run(sql`
      UPDATE \`meditations\`
      SET \`subtle_system_node_weights\` = ${JSON.stringify(weights)}
      WHERE \`id\` = ${med.id};
    `)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  if (await columnExists(db, 'meditations', 'subtle_system_node_weights')) {
    await db.run(sql`ALTER TABLE \`meditations\` DROP COLUMN \`subtle_system_node_weights\`;`)
  }
  if (await columnExists(db, '_meditations_v', 'version_subtle_system_node_weights')) {
    await db.run(sql`ALTER TABLE \`_meditations_v\` DROP COLUMN \`version_subtle_system_node_weights\`;`)
  }
}
