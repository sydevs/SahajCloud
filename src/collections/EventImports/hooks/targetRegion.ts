/**
 * `targetRegion`'s picker scoping and its validator, together because they have
 * to name the same options.
 *
 * ⚠ **The ownership half is `ownedRegionFilterOptions`, not a second answer to
 * it.** That is the one mechanism this repo decides "which regions may this
 * manager write inside" with, and `Events.region` and `Regions.parent` compose
 * it with a level filter in exactly this shape. A subtree answer derived here
 * would be a third, and the one that does not ride `resolveManagedDocIds`'
 * per-request memo.
 *
 * ⚠ **`filterOptions` narrows the picker. The composed validator is what
 * REFUSES the write.** Supplying any `validate` stops Payload installing its own
 * `relationship` validator, and `validateFilterOptions` — the half that applies
 * the narrowing at save time — lives inside it. So a bare custom validator here
 * would leave `filterOptions` decorating the dropdown and enforcing nothing,
 * the same trap `src/collections/AGENTS.md` records for a custom `text`
 * validator dropping `maxLength`.
 */

import type { PayloadRequest, RelationshipFieldValidation, Where } from 'payload'

import { relationship } from 'payload/shared'

import { ownedRegionFilterOptions } from '@/plugins/access'

import {
  isProposableTargetLevel,
  PROPOSABLE_TARGET_LEVELS,
  unproposableTargetMessage,
} from '../propose/tree'

const PROPOSABLE_LEVELS: Where = { level: { in: [...PROPOSABLE_TARGET_LEVELS] } }

export const targetRegionFilterOptions = async (args: {
  req: PayloadRequest
}): Promise<Where | boolean> => {
  const owned = await ownedRegionFilterOptions(args)
  if (owned === true) return PROPOSABLE_LEVELS
  if (owned === false) return false
  return { and: [PROPOSABLE_LEVELS, owned] }
}

export const validateTargetRegion: RelationshipFieldValidation = async (value, options) => {
  // ⚠ **Create only.** `access.update: () => false` already refuses a re-point,
  // and Payload back-fills the stored value before `validate` runs — so on every
  // later save this would spend a read re-approving a value that cannot have
  // changed. A batch is saved repeatedly: once per progress tick, and again as
  // rows land. Permission is re-checked at create and at the
  // `review → committing` transition, nowhere else.
  if (options.operation !== 'create') return true

  const standard = await relationship(value, {
    ...options,
    relationTo: 'regions',
    filterOptions: targetRegionFilterOptions,
    required: true,
  } as never)
  if (standard === true) return true

  // Payload's own refusal is "invalid selection", naming a row number. Two of
  // the three reasons it can fire for have a sentence a volunteer can act on,
  // so they are read back here — on the refusal path only.
  return (await refusalReason(value, options.req)) ?? standard
}

/** Why the narrowing refused this region, where we can say something better. */
async function refusalReason(value: unknown, req: PayloadRequest): Promise<string | null> {
  const id = typeof value === 'number' || typeof value === 'string' ? value : null
  if (id === null) return null

  const region = await req.payload.findByID({
    collection: 'regions',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    select: { level: true },
    req,
  })
  if (!region) return 'That region no longer exists.'
  // A venue is the mistake a volunteer actually makes, and the message names
  // the three levels that do work.
  if (!isProposableTargetLevel(region.level)) return unproposableTargetMessage(region.level)
  return 'You do not manage that region.'
}
