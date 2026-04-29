import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

import { recomputeWeightsForMeditation } from '@/hooks/meditationHooks'
import type { Meditation } from '@/payload-types'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`meditations\` ADD \`subtle_system_node_weights\` text;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` ADD \`version_subtle_system_node_weights\` text;`)

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
  await db.run(sql`ALTER TABLE \`meditations\` DROP COLUMN \`subtle_system_node_weights\`;`)
  await db.run(sql`ALTER TABLE \`_meditations_v\` DROP COLUMN \`version_subtle_system_node_weights\`;`)
}
