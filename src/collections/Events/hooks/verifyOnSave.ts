import type { CollectionBeforeChangeHook } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

import { actorFromUser, computeVerifyFields, managerCadence } from '../lifecycle/verify'

/**
 * Re-verify on save: any meaningful manager edit re-opens the verification
 * cycle (Atlas re-verified on every save). Merges the verify field patch
 * (stage → `verified`, fresh `nextCheckAt`, reset `notificationLog` with a
 * `re-save` first entry) into the outgoing data — `_status` is left to the
 * manager's save choice (publish vs draft); the explicit verify endpoints are
 * what re-publish an unpublished event.
 *
 * Guards:
 * - `req.context.skipVerifyHook` — the ExpireEvents job's and the verify
 *   endpoint's own writes (and the #479 importer) set this so their values
 *   aren't clobbered.
 * - `finished` — terminal; a routine save doesn't revive it (only the explicit
 *   verify action can).
 */
export const verifyOnSave: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
  context,
}) => {
  if (context?.skipVerifyHook) return data
  if (originalDoc?.verificationStage === 'finished') return data

  // `data.manager` is the incoming relationship id; fall back to the persisted
  // value when the manager isn't part of this change.
  const managerId = relationId(data.manager ?? originalDoc?.manager)
  let frequency: string | undefined
  if (managerId) {
    const manager = await req.payload
      .findByID({ collection: 'managers', id: managerId, depth: 0, overrideAccess: true, req })
      .catch(() => null)
    frequency = managerCadence(manager)
  }

  return {
    ...data,
    ...computeVerifyFields({
      method: 're-save',
      by: actorFromUser(req.user),
      frequency,
      now: new Date(),
    }),
  }
}
