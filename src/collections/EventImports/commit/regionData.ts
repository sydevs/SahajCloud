/**
 * What the commit writes to `regions` for one proposed node.
 *
 * ⚠ **Derived from the generated `Region`, not restated.** `level` and the
 * location columns are the two places this repo has already shipped a
 * hand-written union that type-checked and was then refused at write (#671), so
 * the shape is pinned to the collection's own types.
 */

import type { ProposedNode } from '../propose/tree'

import { makeManualMapboxId } from '@/lib/mapbox/manualLocation'
import type { Region } from '@/payload-types'

export interface RegionCreateData {
  level: Region['level']
  name: string
  slug: string
  mapboxId: string
  /** Always set: the import creates no country, the one level with no parent. */
  parent: number
  latitude?: number
  longitude?: number
  radius?: number
}

/**
 * The create payload for a node, or null when the node is not one to create.
 *
 * ⚠ **A hand-located node's `mapboxId` is seeded, never random.** `Regions`
 * requires one and holds a `unique` constraint on it, so a commit that died
 * after writing a state and was re-fired would otherwise write a second one
 * under a fresh uuid — two Bavarias, with the batch's classes split between
 * them. The seed is the batch id and the node's own key, both stable across
 * attempts, so the retry collides on the constraint instead and the commit reads
 * the region already there.
 *
 * ⚠ **The batch id is in the seed on purpose: two batches proposing one hall get
 * two ids, not one.** Review is per batch, so a node another batch created is a
 * region this one matches through `propose/match.ts` — never one it adopts by
 * guessing the same seed. A commit recovering from its own collision must do so
 * inside a savepoint, or the unique violation aborts the surrounding transaction.
 */
export function regionCreateData(
  node: ProposedNode,
  parentId: number,
  batchId: number,
): RegionCreateData | null {
  if (node.match.kind !== 'create' || !node.slug || !node.location) return null

  const base = { level: node.level, name: node.name, slug: node.slug, parent: parentId }
  if (node.location.kind === 'mapbox') {
    return { ...base, mapboxId: node.location.mapboxId }
  }
  const { latitude, longitude, radius } = node.location
  return {
    ...base,
    mapboxId: manualMapboxIdFor(batchId, node.key),
    latitude,
    longitude,
    radius,
  }
}

/** The one spelling of a hand-located node's id, so a retry recomputes it. */
export function manualMapboxIdFor(batchId: number, nodeKey: string): string {
  return makeManualMapboxId(`import-${batchId}-${nodeKey}`)
}
