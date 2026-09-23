import type { Payload } from 'payload'

import { expect } from 'vitest'

import { EVENT_IMAGE_LIMIT } from '@/lib/utilities/eventImages'

import { testData } from './testData'

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

/**
 * Seed the `images` half of that shape: one image over the limit, since
 * `maxRows` counts rows. Derived from the limit, never a literal — raise
 * `maxRows` against a literal and the seed becomes valid and its case vacuous.
 *
 * It leaves `_status`, `verificationStage`, the schedule and the contact fields
 * alone, so a spec's own gates are unaffected by the seed.
 */
export async function storeEventOverImageLimit(payload: Payload, id: number): Promise<void> {
  const image = await testData.createImage(payload)
  await storeInvalidEvent(payload, id, {
    images: Array.from({ length: EVENT_IMAGE_LIMIT + 1 }, () => image.id),
  })
}

/**
 * Non-vacuity: the identical write through the public API is still refused, so
 * a case asserting the bypass passes only because the code under test bypasses
 * validation — not because the seed left the document valid.
 */
export async function expectEventWriteRefused(
  payload: Payload,
  id: number,
  data: Record<string, unknown>,
  pattern: RegExp,
): Promise<void> {
  await expect(
    payload.update({
      collection: 'events',
      id,
      data,
      context: { skipVerifyHook: true },
      overrideAccess: true,
    }),
  ).rejects.toThrow(pattern)
}
