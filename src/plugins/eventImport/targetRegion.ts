/**
 * `targetRegion`'s scoping: a country, region or city in the uploader's owned
 * subtree, which the picker offers and the validator enforces.
 */

import type { PayloadRequest, RelationshipFieldValidation, Where } from 'payload'

import { relationship } from 'payload/shared'

import { ownedRegionFilterOptions } from '@/plugins/access'

/** Where imported classes may be filed: a venue has no cities under it. */
const TARGETABLE: Where = { level: { in: ['country', 'region', 'city'] } }

export const targetRegionFilterOptions = async (args: {
  req: PayloadRequest
}): Promise<Where | boolean> => {
  const owned = await ownedRegionFilterOptions(args)
  if (owned === true) return TARGETABLE
  if (owned === false) return false
  return { and: [TARGETABLE, owned] }
}

/**
 * Payload's own `relationship` validator, with the same `filterOptions`,
 * required — on create only. ⚠ It is composed, not replaced: a bare custom
 * `validate` would leave `filterOptions` narrowing the picker and enforcing
 * nothing (`src/collections/AGENTS.md`). Create only, because the job's later
 * writes run as the uploader, whose subtree may since have shrunk.
 */
export const validateTargetRegion: RelationshipFieldValidation = (value, options) =>
  options.operation !== 'create' ||
  relationship(value, {
    ...options,
    relationTo: 'regions',
    filterOptions: targetRegionFilterOptions,
    required: true,
  } as never)
