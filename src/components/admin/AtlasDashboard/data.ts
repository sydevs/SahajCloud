import type { PayloadRequest } from 'payload'

import { isAtlasOrganiser, programSummary } from './model'

/** Use the collection's actual write scope: project read access alone is wider. */
export async function getAtlasDashboardData(req: PayloadRequest) {
  if (!isAtlasOrganiser(req.user)) return null
  const access = req.payload.collections.events.config.access
  const [scope, canCreate] = await Promise.all([access.update!({ req }), access.create!({ req })])
  if (scope === false) return { ...programSummary([]), canCreate: canCreate === true }
  const result = await req.payload.find({
    collection: 'events',
    req,
    overrideAccess: false,
    draft: true,
    depth: 0,
    pagination: false,
    locale: req.locale,
    ...(scope === true ? {} : { where: scope }),
    select: {
      title: true,
      _status: true,
      verificationStage: true,
      updatedAt: true,
      eventType: true,
      address: { venueName: true, city: true },
    },
  })
  // Latest drafts can have a published copy. Read the base documents separately.
  const published = await req.payload.find({
    collection: 'events',
    req,
    overrideAccess: false,
    draft: false,
    depth: 0,
    pagination: false,
    locale: req.locale,
    where: { and: [scope === true ? {} : scope, { _status: { equals: 'published' } }] },
    select: { _status: true, verificationStage: true },
  })
  const publishedById = new Map(published.docs.map((event) => [event.id, event]))
  return {
    ...programSummary(
      result.docs.map((event) => ({
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
