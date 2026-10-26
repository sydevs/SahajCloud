import type { PayloadRequest, Where } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import {
  PROGRAM_TABS,
  programTabWhere,
  type AtlasDashboardData,
  type Program,
  type ProgramQuery,
} from './model'

/**
 * Use the collection's actual write scope: project read access alone is wider.
 * Containment to the Atlas project is the dashboard view's call, not this read's.
 *
 * Filters, order and pages run on the base documents — the stage and status the
 * nightly job acts on. The page's latest drafts then supply what the manager
 * last wrote: title, location, and whether unpublished changes are waiting.
 */
export async function getAtlasDashboardData(
  req: PayloadRequest,
  query: ProgramQuery,
): Promise<AtlasDashboardData> {
  const access = req.payload.collections.events.config.access
  // Concurrent reads on one req must not share it (src/collections/AGENTS.md).
  const [scope, canCreate] = await Promise.all([
    access.update!({ req: localeIsolatedReq(req) }),
    access.create!({ req: localeIsolatedReq(req) }),
  ])
  if (scope === false) {
    return {
      canCreate: canCreate === true,
      query,
      counts: { all: 0, review: 0, drafts: 0 },
      programs: emptyPage(query),
    }
  }
  const scoped = (tab: ProgramQuery['tab']): Where =>
    scope === true ? programTabWhere(tab) : { and: [scope, programTabWhere(tab)] }
  const common = { collection: 'events', overrideAccess: false, locale: req.locale } as const

  const [counts, page] = await Promise.all([
    Promise.all(
      PROGRAM_TABS.map((tab) =>
        req.payload.count({
          collection: 'events',
          overrideAccess: false,
          req: localeIsolatedReq(req),
          where: scoped(tab),
        }),
      ),
    ),
    req.payload.find({
      ...common,
      req: localeIsolatedReq(req),
      depth: 0,
      where: scoped(query.tab),
      sort: ['verificationRank', '-updatedAt'],
      page: query.page,
      limit: query.limit,
      select: { _status: true, verificationStage: true, updatedAt: true },
    }),
  ])
  const latest = page.docs.length
    ? await req.payload.find({
        ...common,
        req: localeIsolatedReq(req),
        depth: 0,
        draft: true,
        pagination: false,
        where: { id: { in: page.docs.map((event) => event.id) } },
        select: {
          title: true,
          _status: true,
          eventType: true,
          address: { venueName: true, city: true },
        },
      })
    : { docs: [] }
  const latestById = new Map(latest.docs.map((event) => [event.id, event]))

  return {
    canCreate: canCreate === true,
    query,
    counts: Object.fromEntries(
      PROGRAM_TABS.map((tab, index) => [tab, counts[index]!.totalDocs]),
    ) as AtlasDashboardData['counts'],
    programs: {
      ...page,
      docs: page.docs.map((event): Program => {
        const draft = latestById.get(event.id)
        return {
          id: event.id,
          title: draft?.title ?? '',
          _status: draft?._status ?? event._status,
          verificationStage: event.verificationStage,
          updatedAt: event.updatedAt,
          eventType: draft?.eventType,
          address: draft?.address,
          published: event._status === 'published',
        }
      }),
    },
  }
}

function emptyPage({ page, limit }: ProgramQuery): AtlasDashboardData['programs'] {
  return {
    docs: [],
    totalDocs: 0,
    limit,
    page,
    totalPages: 1,
    pagingCounter: 0,
    hasPrevPage: false,
    hasNextPage: false,
    prevPage: null,
    nextPage: null,
  }
}
