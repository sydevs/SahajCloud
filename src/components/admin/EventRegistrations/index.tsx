import type { DocumentViewServerProps } from 'payload'

import { loadEventRegistrations, parseRegistrationQuery } from './data'
import { EventRegistrationsView } from './EventRegistrationsView'
import { redirectRefused } from '../helpers/requireAdminAccess'

/**
 * The Registrations tab on an event: who signed up, for the manager who runs it.
 *
 * `Root` has already checked admin access for the document route; the loader
 * is the narrower gate, and `null` from it means this visitor may not read
 * these rows.
 */
export default async function EventRegistrations({
  initPageResult,
  searchParams,
}: DocumentViewServerProps) {
  const { req, docID } = initPageResult
  const data = await loadEventRegistrations(req, docID, parseRegistrationQuery(searchParams))
  if (!data) redirectRefused(req)

  return <EventRegistrationsView data={data} />
}
