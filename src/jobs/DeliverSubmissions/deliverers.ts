import type { DeliveryRegistry } from './types'

import { deliverContact } from './deliverContact'
import { deliverProposal } from './deliverProposal'
import { deliverRegistration } from './deliverRegistration'
import { deliverSubscribe } from './deliverSubscribe'

/**
 * Every per-type difference in delivery, in one table.
 *
 * **To add a submission type, you add a row here and nothing else in this job.**
 * `DeliverSubmissions` looks the deliverer up rather than branching on the type,
 * so the retry bound, the `activityLog` entry, the `failed` status and the
 * "already settled" guard are written once and apply to whatever is added — a
 * new type inherits the whole pipeline instead of restating it.
 *
 * ⚠ **Omitting a row is a compile error, not a runtime `undefined`.**
 * `DeliveryRegistry` keys on the generated `UserSubmission['type']` union (see
 * `./types`), so a type added to `SUBMISSION_TYPES` and regenerated cannot ship
 * without a deliverer. That is the real value of the table over a `switch`,
 * whose `default` branch silently absorbs the new case.
 *
 * The one gap that leaves — a type added to `SUBMISSION_TYPES` *before*
 * `pnpm generate:types` runs, where the union has not caught up and there is no
 * error to see — is closed at runtime by
 * `tests/unit/submission-deliverers.spec.ts`.
 *
 * A deliverer that is not an email send is expected, not an exception:
 * `deliverSubscribe` is an HTTP call to a mailing-list provider.
 */
export const DELIVERERS: DeliveryRegistry = {
  contact: deliverContact,
  subscribe: deliverSubscribe,
  registration: deliverRegistration,
  proposal: deliverProposal,
}
