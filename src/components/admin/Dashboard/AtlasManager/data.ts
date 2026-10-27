import type { PayloadRequest } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import {
  inProgramTab,
  paginate,
  PROGRAM_TABS,
  sortPrograms,
  type AtlasManagerData,
  type Program,
  type ProgramQuery,
} from './model'

/**
 * Use the collection's actual write scope: project read access alone is wider.
 * Containment to the Atlas project is the dashboard view's call, not this read's.
 *
 * Every program in scope is read, but only the four columns that order and
 * count it — a manager's scope is a region subtree, so this stays small, and
 * the stage ranks need no column of their own. Those are the base documents:
 * the stage and status the nightly job acts on. Only the page shown then reads
 * its latest drafts, for what the manager last wrote.
 */
export async function getAtlasManagerData(
  req: PayloadRequest,
  query: ProgramQuery,
): Promise<AtlasManagerData> {
  const access = req.payload.collections.events.config.access
  // Concurrent reads on one req must not share it (src/collections/AGENTS.md).
  const [scope, canCreate] = await Promise.all([
    access.update!({ req: localeIsolatedReq(req) }),
    access.create!({ req: localeIsolatedReq(req) }),
  ])
  const rows =
    scope === false
      ? []
      : (
          await req.payload.find({
            collection: 'events',
            req: localeIsolatedReq(req),
            overrideAccess: false,
            depth: 0,
            pagination: false,
            where: scope === true ? {} : scope,
            select: { _status: true, verificationStage: true, updatedAt: true },
          })
        ).docs
  const ordered = sortPrograms(rows)
  const page = paginate(
    ordered.filter((row) => inProgramTab(row, query.tab)),
    query.page,
    query.limit,
  )

  const latest = page.docs.length
    ? await req.payload.find({
        collection: 'events',
        req: localeIsolatedReq(req),
        overrideAccess: false,
        depth: 0,
        draft: true,
        pagination: false,
        locale: req.locale,
        where: { id: { in: page.docs.map((row) => row.id) } },
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
    query: { ...query, page: page.page ?? query.page },
    counts: Object.fromEntries(
      PROGRAM_TABS.map((tab) => [tab, ordered.filter((row) => inProgramTab(row, tab)).length]),
    ) as AtlasManagerData['counts'],
    programs: {
      ...page,
      docs: page.docs.map((row): Program => {
        const draft = latestById.get(row.id)
        return {
          id: row.id,
          title: draft?.title ?? '',
          _status: draft?._status ?? row._status,
          verificationStage: row.verificationStage,
          updatedAt: row.updatedAt,
          eventType: draft?.eventType,
          address: draft?.address,
          published: row._status === 'published',
        }
      }),
    },
  }
}
