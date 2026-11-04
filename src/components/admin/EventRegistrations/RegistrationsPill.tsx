import type { PayloadRequest } from 'payload'

import { countAcceptedRegistrations } from './data'

/**
 * The count on the Registrations tab, beside its label like the Versions tab's.
 *
 * A tab `Pill` is handed `req` but no document id, so it reads the id `Root`
 * resolved from the route.
 */
export default async function RegistrationsPill({ req }: { req: PayloadRequest }) {
  const id = req.routeParams?.id
  const count = await countAcceptedRegistrations(
    req,
    typeof id === 'string' || typeof id === 'number' ? id : undefined,
  )
  if (!count) return null
  // Payload's own class for the Versions count, so the two pills match in
  // every tab state.
  return <span className="pill-version-count">{count}</span>
}
