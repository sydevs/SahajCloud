/**
 * What creating a listing from somebody else's data says about its verification.
 *
 * ⚠ **The stage and `skipVerifyHook` are one decision.** `skipVerifyHook` means
 * "open no verification cycle", which is right for a listing nobody has taken on
 * and wrong for an adopted one — an adopted listing must take the same path as
 * assigning a manager in the admin, or it is stamped `verified` with no
 * `nextCheckAt` and never comes up for re-verification again.
 *
 * ⚠ **Shared because that failure is silent.** A listing created with the wrong
 * `languages` shows in the admin the same day; one stamped `verified` with no
 * clock behaves correctly for a year. Both writers that create a listing on
 * someone's behalf read it: accepting a visitor's proposal
 * (`UserSubmissions/lifecycle/review.ts`) and the bulk import
 * (`EventImports/commit/eventData.ts`).
 *
 * ⚠ **This is the WRITE side only, which is why `newEventDefaults` still states a
 * stage of its own.** That function also feeds the reviewer's preview and diff
 * through `mergeProposal`, so it has to name the stage an accepted proposal will
 * end up at — `verified` with a manager. Here the same case writes nothing and
 * lets `syncVerificationOnSave` set it from the manager's cadence. Displaying a
 * stage and writing one are different jobs, and collapsing them would blank that
 * line in the review UI.
 */

import { relationId } from '@/lib/utilities/relationId'

export interface ListingAdoption {
  /**
   * The stage to write, or nothing.
   *
   * ⚠ **Empty for an adopted listing, deliberately.** `syncVerificationOnSave`
   * sets the stage from the manager's own cadence, so a value stated here would
   * be overwritten — which makes stating one a claim the write does not mean.
   */
  data: { verificationStage?: 'unverified' }
  context: { skipVerifyHook: boolean }
}

/**
 * @param manager The manager adopting the listing — an id, a document, or null.
 */
export function newListingAdoption(manager: unknown): ListingAdoption {
  const unmanaged = relationId(manager) === null
  return {
    data: unmanaged ? { verificationStage: 'unverified' } : {},
    context: { skipVerifyHook: unmanaged },
  }
}
