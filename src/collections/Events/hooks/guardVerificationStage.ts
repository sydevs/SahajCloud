import { EVENT_ACTORS, EVENT_MACHINE } from '@/lib/eventVerification/machine'
import { guardTransition } from '@/lib/stateMachine/guard'

/**
 * beforeChange (update): refuse a verification-stage change that is not in the
 * table, and report it.
 *
 * ⚠ **No writer here is a person.** `verificationStage` is `admin.readOnly`,
 * which is the admin UI alone — so before this any manager holding
 * `events: update` could `PATCH` the column to any value, with nothing applying
 * what the new stage implies: no watermark, no reminder cycle, no publish
 * change. Every legitimate change is derived by a hook or made by an operation,
 * and each of those names itself.
 *
 * ⚠ **Registered after `syncVerificationOnSave`**, which is the hook that
 * derives the stage and declares its own actor. A collection's `beforeChange`
 * array runs in order, so this must judge the patch that hook produced.
 */
export const guardVerificationStage = guardTransition({
  machine: EVENT_MACHINE,
  // Every one of them: no writer of this column is a person.
  declarable: EVENT_ACTORS,
})
