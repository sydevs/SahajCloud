/**
 * Region-Subtree Write Scoping (Atlas managers)
 *
 * The `atlas-manager` role grants create/update on `regions` and
 * create/update/delete on `events`. Those grants are intentionally **not**
 * collection-wide: an Atlas manager may only write to events and regions inside
 * the region subtree they own (the regions that list them in `managers`, plus
 * every descendant via the nested-docs `breadcrumbs` trail).
 *
 * This module narrows a role-granted write into a scoped `Where` (or a boolean
 * for single-document / create checks). It is wired into `createAccessConfig`
 * *after* the role-based permission check has already passed — so it only ever
 * tightens access, never widens it.
 *
 * Scope is intentionally keyed off an explicit slug allowlist (`regions`,
 * `events`) rather than generic field introspection. Unlike the collection-
 * agnostic document-manager fallback (`documentManagers.ts`), create/delete
 * scoping is a deliberate, security-sensitive grant we want to be able to audit
 * at a glance — a stray `managers` field on some future collection must not
 * silently opt it into writable-by-subtree behavior.
 *
 * Events are scoped by their `region` relationship (not a manager field of
 * their own); the union with `manager === user` preserves the direct-owner
 * update access the document-manager fallback grants today.
 */

import type { ContentSlug } from './types'
import type { PayloadRequest, Where } from 'payload'

import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import { isManager } from './adminOnly'
import { getDocManagerFields, relationId, resolveManagedDocIds } from './documentManagers'

/** Collections whose writes are scoped to the Atlas manager's owned-region subtree. */
const REGION_SUBTREE_COLLECTIONS = new Set<ContentSlug>(['regions', 'events'])

/** True when the collection participates in region-subtree write scoping. */
export function isRegionSubtreeCollection(collection: ContentSlug): boolean {
  return REGION_SUBTREE_COLLECTIONS.has(collection)
}

interface ScopeArgs {
  req: PayloadRequest
  collection: ContentSlug
  operation: 'create' | 'update' | 'delete'
  /** Present for single-document update/delete. */
  id?: number | string
  /** Present for create (the incoming document). */
  data?: unknown
}

/**
 * Resolve the region ids the user owns plus all descendants — the subtree their
 * writes are confined to. One-to-two queries regardless of tree depth (see
 * `resolveManagedDocIds`).
 */
export function resolveOwnedRegionIds(req: PayloadRequest, userId: number): Promise<number[]> {
  const regionFields = getDocManagerFields(req.payload, 'regions')
  return resolveManagedDocIds(req, 'regions', userId, regionFields)
}

/**
 * `filterOptions` for region relationships (events.region, regions.parent): an
 * active non-admin manager may only pick from their owned-region subtree; admins
 * and other users see all regions. A manager who owns no region gets no options.
 */
export async function ownedRegionFilterOptions({
  req,
}: {
  req: PayloadRequest
}): Promise<Where | boolean> {
  const user = req.user
  if (!isManager(user)) {
    return true
  }
  const ownedRegionIds = await resolveOwnedRegionIds(req, Number(user.id))
  return ownedRegionIds.length ? { id: { in: ownedRegionIds } } : false
}

/** An event as the subtree scope sees it: where it sits, and who owns it. */
export interface EventScope {
  regionId: number | null
  managerId: number | null
}

/**
 * Whether one event is inside a manager's scope: its region is in their owned
 * subtree, or they are its own manager. The single-document form of
 * `eventScopeWhere`, shared by the write scope below and by who may read the
 * contact addresses in an event's activity log (`logAddressVisibility.ts`).
 */
export function isEventInScope(
  ownedRegionIds: readonly number[],
  userId: number,
  event: EventScope,
): boolean {
  if (event.regionId !== null && ownedRegionIds.includes(event.regionId)) return true
  return event.managerId === userId
}

/** `Where` selecting events inside the owned subtree, unioned with directly-owned events. */
function eventScopeWhere(ownedRegionIds: number[], userId: number): Where {
  const or: Where[] = [{ manager: { equals: userId } }]
  // Skip an empty `in` (matches nothing, and some adapters dislike it) — the
  // manager clause alone still scopes correctly when the user owns no regions.
  if (ownedRegionIds.length) or.unshift({ region: { in: ownedRegionIds } })
  return or.length === 1 ? or[0]! : { or }
}

/** The `req.context` key {@link resolveContactableManagerIds} memoizes under. */
export const contactableManagersMemoKey = (userId: number): string =>
  `contactableManagerIds:${userId}`

/**
 * The managers assigned anywhere inside a manager's owned subtree, resolved at
 * most **once per reader per request** — whose email and contact methods that
 * reader may see on another manager's row (#908, widened by the maintainer on
 * 2026-10-30 so a region manager can contact the managers below them).
 *
 * Assigned means either of the two relationships the write scope reads:
 *
 * - the `manager` of an event that passes `eventScopeWhere` — the list form of
 *   `isEventInScope`, the test this reader's event writes pass;
 * - one of the `managers` of a region in the owned subtree. The subtree
 *   includes its roots, so a region's **co-managers** reach each other: they
 *   already hold the same write scope over that region and every event in it.
 *
 * Downward only — a sub-region manager does not reach the region managers
 * above them, since nothing above is in their subtree.
 *
 * ⚠ **A set per request, never a query per row.** Field access runs once per
 * row, so a picker listing N managers would otherwise pay N lookups. This
 * costs `resolveOwnedRegionIds` (memoized and shared with every other access
 * decision on `req`) plus two queries, and none when the reader owns no region.
 * The memo key carries the reader alone, for the reasons and with the
 * staleness window `resolveManagedDocIds` documents: both relationships are
 * non-localized, so a locale copy of `req` sharing `context` reads the same set.
 *
 * ⚠ **The two queries take no `req`.** They run inside a field lock, which
 * `afterRead` evaluates on the response of a write while its transaction is
 * still open — joining it can roll the write back (`src/collections/AGENTS.md`).
 * An assignment made earlier in the same request is therefore not yet seen,
 * which hides an address rather than showing one.
 *
 * A trashed event assigns nobody: `find` excludes trash by default.
 */
export function resolveContactableManagerIds(
  req: PayloadRequest,
  userId: number,
): Promise<ReadonlySet<number>> {
  return memoizeOnRequest(req, contactableManagersMemoKey(userId), async () => {
    const ownedRegionIds = await resolveOwnedRegionIds(req, userId)
    if (!ownedRegionIds.length) return new Set<number>()
    const [events, regions] = await Promise.all([
      req.payload.find({
        collection: 'events',
        where: eventScopeWhere(ownedRegionIds, userId),
        select: { manager: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      }),
      req.payload.find({
        collection: 'regions',
        where: { id: { in: ownedRegionIds } },
        select: { managers: true },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      }),
    ])
    const ids = new Set<number>()
    for (const event of events.docs) {
      const managerId = relationId(event.manager)
      if (managerId !== null) ids.add(managerId)
    }
    for (const region of regions.docs) {
      for (const manager of region.managers ?? []) {
        const managerId = relationId(manager)
        if (managerId !== null) ids.add(managerId)
      }
    }
    return ids
  })
}

/**
 * Narrow a role-granted write to the manager's owned-region subtree.
 *
 * Returns:
 * - `boolean` for create (validates the incoming `parent`/`region`) and for
 *   single-document update/delete (`id` present).
 * - `Where` for list-level update/delete (no `id`).
 */
export async function scopeRegionSubtreeWrite({
  req,
  collection,
  operation,
  id,
  data,
}: ScopeArgs): Promise<boolean | Where> {
  const userId = Number(req.user!.id)
  const ownedRegionIds = await resolveOwnedRegionIds(req, userId)

  if (collection === 'regions') {
    if (operation === 'create') {
      // No parent chosen yet (opening the create form, or default-populated
      // doc behind the capability check) — allowed when they own a region. Once
      // a parent is set, it must be inside the owned subtree.
      const parentId = relationId((data as { parent?: unknown } | null)?.parent)
      if (parentId !== null) return ownedRegionIds.includes(parentId)
      return ownedRegionIds.length > 0
    }
    // update (region delete isn't granted to atlas-manager). A re-parent must
    // keep the region inside the owned subtree — reject moving it under a region
    // they don't own. Applies to single and bulk updates.
    const newParentId = relationId((data as { parent?: unknown } | null)?.parent)
    if (newParentId !== null && !ownedRegionIds.includes(newParentId)) return false
    if (id !== undefined) return ownedRegionIds.includes(Number(id))
    return ownedRegionIds.length ? { id: { in: ownedRegionIds } } : false
  }

  // events
  if (operation === 'create') {
    // No region chosen yet (opening the create form, or default-populated doc
    // behind the capability check) — allowed when they own a region. Once a
    // region is set, it must be inside the owned subtree.
    const regionId = relationId((data as { region?: unknown } | null)?.region)
    if (regionId !== null) return ownedRegionIds.includes(regionId)
    return ownedRegionIds.length > 0
  }

  // update / delete (delete with `trash: true` = soft-delete an event). A
  // re-home must keep the event inside the owned subtree — reject moving it to a
  // region they don't own (covers single and bulk updates; delete carries no
  // data, so this is a no-op there).
  const newRegionId = relationId((data as { region?: unknown } | null)?.region)
  if (newRegionId !== null && !ownedRegionIds.includes(newRegionId)) return false
  if (id !== undefined) {
    const event = (await req.payload.findByID({
      collection: 'events',
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      trash: true,
      req,
    })) as { region?: unknown; manager?: unknown } | null
    if (!event) return false
    return isEventInScope(ownedRegionIds, userId, {
      regionId: relationId(event.region),
      managerId: relationId(event.manager),
    })
  }
  return eventScopeWhere(ownedRegionIds, userId)
}
