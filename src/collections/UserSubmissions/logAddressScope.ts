import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'
import { eventAddressScope, regionScopedAddressVisibility } from '@/plugins/access'

import { submissionRoutingRegionId } from './lifecycle/mergeProposal'

type RoutingColumns = Pick<UserSubmission, 'event' | 'region' | 'regionHint'>

const ROUTING_KEYS = ['event', 'region', 'regionHint'] as const

/**
 * The columns `deliverProposal` routes on, off the row when selected, else
 * loaded — without `req`, for the reason `eventAddressScope` gives.
 */
async function routingColumns(
  req: PayloadRequest,
  doc: Record<string, unknown>,
  docId: number | null,
): Promise<RoutingColumns | null> {
  if (ROUTING_KEYS.every((key) => key in doc)) return doc as RoutingColumns
  if (docId == null) return null
  return (await req.payload.findByID({
    collection: 'user-submissions',
    id: docId,
    depth: 0,
    select: { event: true, region: true, regionHint: true },
    overrideAccess: true,
    disableErrors: true,
    trash: true,
  })) as RoutingColumns | null
}

/**
 * Who reads the address a delivery entry's `sentTo` names (#1047).
 *
 * Placed where `deliverProposal` sent it from: the target event, for an update
 * proposal; the region intake placed it in, for a new one. So the managers a
 * review mail could have gone to — the event's own, and the region managers up
 * its chain — read it, and a manager elsewhere sees that it was delivered and
 * when. A contact row's recipient reads their own address.
 */
export const submissionLogAddressVisibility = regionScopedAddressVisibility(
  async ({ req, doc, docId }) => {
    const row = await routingColumns(req, doc, docId)
    if (!row) return null
    const eventId = relationId(row.event)
    if (eventId != null) {
      const event =
        typeof row.event === 'object' ? (row.event as unknown as Record<string, unknown>) : null
      return eventAddressScope(req, event, eventId)
    }
    return { regionId: submissionRoutingRegionId(row), managerId: null }
  },
)
