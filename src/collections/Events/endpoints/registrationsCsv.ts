import type { Endpoint } from 'payload'

import { acceptedRegistrationsCsv } from '@/components/admin/EventRegistrations/data'
import { requireActiveManager } from '@/lib/endpoints'

const refusal = (message: string, status: number): Response =>
  Response.json({ errors: [{ message }] }, { status })

/**
 * GET /api/events/:id/registrations/csv — the event's accepted registrants as a
 * spreadsheet, for the Registrations tab's download button.
 *
 * Admin-panel only, so no `requireActiveClient` and no OpenAPI entry. The gate
 * is the tab's own (`readableEvent`): the event's manager or an admin.
 */
export const registrationsCsv: Endpoint = {
  path: '/:id/registrations/csv',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) return refusal('Invalid event id.', 400)

    const csv = await acceptedRegistrationsCsv(req, id)
    if (csv === null) return refusal('You are not allowed to perform this action.', 403)

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="event-${id}-registrations.csv"`,
      },
    })
  },
}
