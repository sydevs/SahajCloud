/**
 * What a `mapboxId` picker may offer, where its result fills a sibling `street`
 * (#893).
 *
 * `readPickedPlace` has no street of its own to read above the `address`
 * context layer, so it falls back to the feature's own name — a town picked
 * from a `place` result lands in `street`. The admin picker is also the only
 * other writer of `Events.address.mapboxId`, which the CSV importer fills for a
 * door alone, so a coarse layer here is one column holding two identities.
 */
import type { GroupField } from 'payload'

import { describe, expect, it } from 'vitest'

import { addressFields } from '@/fields/addressFields'

/** Mapbox v6 layers at or below a street — everything `street` may be read off. */
const STREET_OR_FINER = new Set(['address', 'street'])

function searchTypesOf(group: GroupField): string {
  const picker = group.fields.find((f) => 'name' in f && f.name === 'mapboxId')
  if (!picker) throw new Error('no mapboxId picker in the address group')
  const types = (picker.admin?.custom as { searchTypes?: string } | undefined)?.searchTypes
  if (!types) throw new Error('the mapboxId picker declares no searchTypes')
  return types
}

describe('the address group picker', () => {
  it('offers no layer coarser than a street', () => {
    const group = addressFields() as GroupField
    const offered = searchTypesOf(group).split(',')

    expect(offered.filter((type) => !STREET_OR_FINER.has(type))).toEqual([])
  })

  it('offers something, so the case above is not vacuous', () => {
    expect(searchTypesOf(addressFields() as GroupField)).toContain('address')
  })
})
