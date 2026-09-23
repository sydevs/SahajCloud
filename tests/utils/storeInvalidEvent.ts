import type { Payload } from 'payload'

/**
 * Put an event into a state its own validators refuse — the defect itself
 * (#835), so neither `payload.create` nor `payload.update` can seed it.
 *
 * The `latest: true` version row is written with the main row on purpose:
 * `updateByID` loads the document it is about to change from that version, so
 * seeding only the main row would leave the write working from the valid one
 * and every case would pass for the wrong reason.
 */
export async function storeInvalidEvent(
  payload: Payload,
  id: number,
  patch: Record<string, unknown>,
): Promise<void> {
  await payload.db.updateOne({ collection: 'events', id, data: patch })
  const { docs } = await payload.db.findVersions({
    collection: 'events',
    where: { parent: { equals: id } },
    sort: '-updatedAt',
    limit: 1,
    pagination: false,
  })
  const latest = docs[0]
  // Events is `versions: { drafts: true }`, so a row without one means the seed
  // silently left the document valid and every case using it is vacuous.
  if (!latest) throw new Error(`event ${id} has no version row to seed`)
  await payload.db.updateVersion({
    collection: 'events',
    id: latest.id,
    versionData: {
      createdAt: new Date(latest.createdAt).toISOString(),
      latest: true,
      parent: id,
      updatedAt: new Date().toISOString(),
      version: { ...latest.version, ...patch },
    },
  })
}
