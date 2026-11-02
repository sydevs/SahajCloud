import type { DocumentViewServerProps } from 'payload'

import { loadEventRegistrations } from './data'
import { EventRegistrationsView } from './EventRegistrationsView'
import { parseRegistrationQuery } from './model'
import { redirectRefused } from '../helpers/requireAdminAccess'

/**
 * The Registrations tab on an event: who signed up, for the manager who runs it.
 *
 * Registration rows are admin-only, so the `registrations` join beside this
 * renders empty for every manager and a program manager's only view of their
 * own signups was the email that announced them.
 *
 * The loader is the gate — `null` means this visitor may not read these rows,
 * which is narrower than the admin access `Root` already checked for the
 * document route, so nothing upstream refuses it.
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
