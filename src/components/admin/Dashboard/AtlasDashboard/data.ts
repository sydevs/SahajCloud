import type { PayloadRequest } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { sortPrograms } from './model'

/**
 * Use the collection's actual write scope: project read access alone is wider.
 * Containment to the Atlas project is the dashboard view's call, not this read's.
 */
export async function getAtlasDashboardData(req: PayloadRequest) {
  const access = req.payload.collections.events.config.access
  // Concurrent reads on one req must not share it (src/collections/AGENTS.md).
  const [scope, canCreate] = await Promise.all([
    access.update!({ req: localeIsolatedReq(req) }),
    access.create!({ req: localeIsolatedReq(req) }),
  ])
  if (scope === false) return { events: [], canCreate: canCreate === true }
  const where = scope === true ? {} : scope
  const common = {
    collection: 'events',
    overrideAccess: false,
    depth: 0,
    pagination: false,
    locale: req.locale,
  } as const
  // Latest drafts can have a published copy, so read the base documents too.
  const [latest, published] = await Promise.all([
    req.payload.find({
      ...common,
      req: localeIsolatedReq(req),
      draft: true,
      where,
      select: {
        title: true,
        _status: true,
        verificationStage: true,
        updatedAt: true,
        eventType: true,
        address: { venueName: true, city: true },
      },
    }),
    req.payload.find({
      ...common,
      req: localeIsolatedReq(req),
      draft: false,
      where: { and: [where, { _status: { equals: 'published' } }] },
      select: { verificationStage: true },
    }),
  ])
  const publishedById = new Map(published.docs.map((event) => [event.id, event]))
  return {
    events: sortPrograms(
      latest.docs.map((event) => ({
        ...event,
        published: publishedById.has(event.id),
        // Draft saves can reset verification without changing the live listing.
        verificationStage:
          publishedById.get(event.id)?.verificationStage ?? event.verificationStage,
      })),
    ),
    canCreate: canCreate === true,
  }
}
