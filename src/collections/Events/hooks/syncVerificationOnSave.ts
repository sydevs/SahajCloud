import type { CollectionBeforeChangeHook } from 'payload'

import { isPreAdoptionStage } from '@/lib/eventVerification/stages'
import { resolveNextCheckAt } from '@/lib/eventVerification/watermark'
import { lastOccurrenceEnd } from '@/lib/schedule/scheduleHooks'
import { relationId } from '@/lib/utilities/relationId'
import type { EventSchedule } from '@/types/schedule'

import { actorFromUser, computeVerifyFields, managerCadence } from '../lifecycle/verify'

/**
 * Maintain an event's verification fields on every save. Two mutually
 * exclusive branches, split by whether the event has a manager:
 *
 * - **Pre-adoption** (`unverified` / `denied`, no manager) — nothing is
 *   verified; the save only re-derives the `nextCheckAt` watermark from the
 *   schedule, which is what lets the nightly job find the event when its
 *   schedule runs out. Editing an unverified listing's text is not vouching
 *   that it exists, so the stage is deliberately left alone; assigning a
 *   manager and saving (adoption) is what verifies it — and that save has a
 *   manager, so it takes the branch below.
 * - **Managed** — any meaningful manager edit re-opens the verification cycle
 *   (Atlas re-verified on every save): stage → `verified`, fresh `nextCheckAt`,
 *   `activityLog` reset with a `re-save` first entry. `_status` is left to
 *   the manager's save choice (publish vs draft); the explicit verify endpoints
 *   are what re-publish an unpublished event.
 *
 * **The two branches treat `skipVerifyHook` differently, on purpose.** That
 * flag means "don't re-open the verification cycle" — a decision, which only
 * the managed branch makes. The watermark is *derived data* (like
 * `computeLastDate`), and both paths that create an unverified event — the
 * submission accept op and the bulk importer — set the flag, so honouring it
 * there would leave those events with no watermark and they would never
 * finish. Hence the pre-adoption branch runs first, above the guard.
 *
 * Schedule-derived values are computed from `{ ...originalDoc, ...data }`
 * rather than read off `schedule.lastDate`: collection `beforeChange` hooks run
 * *before* the field hook that writes that column, so the stored value isn't
 * current yet.
 */
export const syncVerificationOnSave: CollectionBeforeChangeHook = async ({
  data,
  req,
  originalDoc,
  context,
}) => {
  const schedule = mergedSchedule(data, originalDoc)
  const inactive = (data.inactive ?? originalDoc?.inactive) as boolean | null | undefined

  // `data.manager` is the incoming relationship id; fall back to the persisted
  // value when the manager isn't part of this change.
  const managerId = relationId(data.manager ?? originalDoc?.manager)
  const stage = (data.verificationStage ?? originalDoc?.verificationStage) as string | undefined

  // Pre-adoption branch — derived data only, so it ignores `skipVerifyHook`.
  if (!managerId && isPreAdoptionStage(stage)) {
    return { ...data, nextCheckAt: resolveNextCheckAt({ stage: 'unverified', schedule, inactive }) }
  }

  if (context?.skipVerifyHook) return data
  if (originalDoc?.verificationStage === 'finished' && !revivesFinishedEvent(schedule)) {
    return data
  }
  // A managerless event on a managed stage (e.g. `finished` after never being
  // adopted) has no cadence to verify against — leave it be.
  if (!managerId) return data

  const manager = await req.payload
    .findByID({ collection: 'managers', id: managerId, depth: 0, overrideAccess: true, req })
    .catch(() => null)

  return {
    ...data,
    ...computeVerifyFields({
      method: 're-save',
      by: actorFromUser(req.user),
      frequency: managerCadence(manager),
      schedule,
      inactive,
      now: new Date(),
    }),
  }
}

/** The schedule this save lands on: an explicit patch value wins over the stored one. */
function mergedSchedule(
  data: Record<string, unknown>,
  originalDoc: Record<string, unknown> | undefined,
): Partial<EventSchedule> | null {
  const original = originalDoc?.schedule as Partial<EventSchedule> | null | undefined
  const incoming = data?.schedule as Partial<EventSchedule> | null | undefined
  if (!incoming && !original) return null
  return { ...original, ...incoming } as Partial<EventSchedule>
}

/**
 * Whether this save brings a `finished` event back to life — i.e. it extends
 * the schedule so the final occurrence is no longer behind us.
 *
 * Needed because #603 decoupled the public feeds from `verificationStage`: they
 * filter on `schedule.lastDate`, so extending the schedule already puts the event
 * back on the map. Without reviving the stage too, it would sit there publicly
 * listed but stuck at `finished` — never re-verified, and counted *inactive* by
 * the Atlas manager sidebar. The admin notice tells managers to update the
 * schedule and save, so that has to be the whole story.
 *
 * A `null` result means the recurrence never ends, which also counts as revived.
 */
function revivesFinishedEvent(schedule: Partial<EventSchedule> | null): boolean {
  if (!schedule) return false
  const lastDate = lastOccurrenceEnd(schedule)
  return lastDate === null || new Date(lastDate) >= new Date()
}
