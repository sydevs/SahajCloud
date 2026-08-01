import type { CollectionBeforeChangeHook } from 'payload'

import { lastOccurrenceEnd } from '@/lib/schedule/scheduleHooks'
import { relationId } from '@/lib/utilities/relationId'
import type { EventScheduleInput } from '@/types/schedule'

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
 * - `finished` — terminal *while the schedule is still run out*. A save that
 *   extends the schedule past today revives it; see `revivesFinishedEvent`.
 */
export const verifyOnSave: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
  context,
}) => {
  if (context?.skipVerifyHook) return data
  if (originalDoc?.verificationStage === 'finished' && !revivesFinishedEvent(data, originalDoc)) {
    return data
  }

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

/**
 * Whether this save brings a `finished` event back to life — i.e. it extends the
 * schedule so the final occurrence is no longer behind us.
 *
 * Needed because #603 decoupled the public feeds from `verificationStage`: they
 * filter on `schedule.lastDate`, so extending the schedule already puts the event
 * back on the map. Without reviving the stage too, it would sit there publicly
 * listed but stuck at `finished` with `nextCheckAt: null` — never re-verified, and
 * counted *inactive* by the Atlas manager sidebar. The admin notice tells managers
 * to update the schedule and save, so that has to be the whole story.
 *
 * The prospective `lastDate` is recomputed here rather than read off `data`:
 * collection `beforeChange` hooks run *before* field `beforeChange` hooks, so
 * `computeLastDate` hasn't written it yet. Same merge it uses — an explicit `null`
 * in the patch must win over the previous value.
 *
 * A `null` result means the recurrence never ends, which also counts as revived.
 */
function revivesFinishedEvent(
  data: Record<string, unknown>,
  originalDoc: Record<string, unknown>,
): boolean {
  const original = originalDoc?.schedule as EventScheduleInput | null | undefined
  const incoming = data?.schedule as EventScheduleInput | null | undefined
  if (!incoming && !original) return false

  const lastDate = lastOccurrenceEnd({ ...original, ...incoming } as EventScheduleInput)
  return lastDate === null || new Date(lastDate) >= new Date()
}
