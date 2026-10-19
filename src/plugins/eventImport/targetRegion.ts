/**
 * `targetRegion`'s picker scoping and its validator, together because they have
 * to name the same options.
 *
 * ⚠ **The ownership half is `ownedRegionFilterOptions`, not a second answer to
 * it.** That is the one mechanism this repo decides "which regions may this
 * manager write inside" with, and `Events.region` and `Regions.parent` compose
 * it with a level filter in exactly this shape.
 *
 * ⚠ **`filterOptions` narrows the picker. The composed validator is what
 * REFUSES the write.** Supplying any `validate` stops Payload installing its own
 * `relationship` validator, and `validateFilterOptions` — the half that applies
 * the narrowing at save time — lives inside it. So a bare custom validator here
 * would leave `filterOptions` decorating the dropdown and enforcing nothing.
 */

import type { PayloadRequest, RelationshipFieldValidation, Where } from 'payload'

import { relationship } from 'payload/shared'

import type { Region } from '@/payload-types'
import { ownedRegionFilterOptions } from '@/plugins/access'

/** Where imported classes may be filed: a venue has no cities under it. */
export const TARGET_LEVELS = ['country', 'region', 'city'] as const

export type TargetLevel = (typeof TARGET_LEVELS)[number]

export function isTargetLevel(level: Region['level']): level is TargetLevel {
  return (TARGET_LEVELS as readonly string[]).includes(level)
}

export function untargetableMessage(level: Region['level']): string {
  return `A ${level} cannot take an import. Pick a country, state or city.`
}

const TARGETABLE: Where = { level: { in: [...TARGET_LEVELS] } }

export const targetRegionFilterOptions = async (args: {
  req: PayloadRequest
}): Promise<Where | boolean> => {
  const owned = await ownedRegionFilterOptions(args)
  if (owned === true) return TARGETABLE
  if (owned === false) return false
  return { and: [TARGETABLE, owned] }
}

export const validateTargetRegion: RelationshipFieldValidation = async (value, options) => {
  // Create only: the field is never updated, and Payload back-fills the stored
  // value before `validate` runs on every later save.
  if (options.operation !== 'create') return true

  const standard = await relationship(value, {
    ...options,
    relationTo: 'regions',
    filterOptions: targetRegionFilterOptions,
    required: true,
  } as never)
  if (standard === true) return true

  // Payload's own refusal is "invalid selection", naming a row number. Two of
  // the three reasons it can fire for have a sentence a volunteer can act on.
  return (await refusalReason(value, options.req)) ?? standard
}

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
  if (!isTargetLevel(region.level)) return untargetableMessage(region.level)
  return 'You do not manage that region.'
}
