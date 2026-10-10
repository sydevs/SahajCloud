/**
 * `targetRegion`'s own validator: a region in the caller's subtree, at a level a
 * batch can hold.
 *
 * ⚠ **This is the only place an import asks whether the caller may write inside
 * a region, and it asks the access plugin rather than re-deriving an answer.**
 * `userManagesDocument` is what `Regions` itself decides document-manager access
 * with, so a second reading of "my subtree" here would be a second answer to it.
 * Everything after the create trusts the stored value — the field refuses
 * `update` outright, and the jobs run with no user at all.
 *
 * ⚠ **`filterOptions` narrows the picker; this refuses the write.** A relationship
 * `filterOptions` is applied on every save, so the level is already covered for
 * a value Payload validates — but it answers "invalid selection" naming a row
 * number, and the level is the mistake a volunteer actually makes (a venue).
 * Naming it is worth the second check.
 */

import type { RelationshipFieldValidation } from 'payload'

import { getDocManagerFields, userManagesDocument } from '@/plugins/access/documentManagers'

import { isProposableTargetLevel, unproposableTargetMessage } from '../propose/tree'

export const validateTargetRegion: RelationshipFieldValidation = async (value, { req }) => {
  // Payload's own `required` reports a missing value; answering it here too
  // would replace that message with a worse one.
  if (value == null || value === '') return true

  const id = typeof value === 'object' ? (value as { value?: unknown }).value : value
  if (typeof id !== 'number' && typeof id !== 'string') return 'Pick a region.'

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
  if (!isProposableTargetLevel(region.level)) return unproposableTargetMessage(region.level)

  // An admin manages every region; `userManagesDocument` is asked only of
  // everyone else, and a client has no manager row to match against.
  const user = req.user
  if (!user) return 'Sign in to start an import.'
  if (user.collection === 'managers' && user.type === 'admin') return true

  const manages = await userManagesDocument(
    req,
    'regions',
    user.id,
    id,
    getDocManagerFields(req.payload, 'regions'),
  )
  return manages || 'You do not manage that region.'
}
