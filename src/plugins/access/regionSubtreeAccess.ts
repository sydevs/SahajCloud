/**
 * Region-Subtree Write Scoping (Atlas managers)
 *
 * The `atlas-region-manager` role grants create/update on `regions` and
 * create/update/delete on `events`; `atlas-event-manager` grants
 * update/delete on `events` alone. Those grants are intentionally **not**
 * collection-wide: a region manager may only write to events and regions inside
 * the region subtree they own (the regions that list them in `managers`, plus
 * every descendant via the nested-docs `breadcrumbs` trail), and an event
 * assignee only to the events naming them.
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
 * their own); the union with `manager === user` is what an event assignee's
 * whole grant narrows to, since they own no region.
 */

import type { ContentSlug } from './types'
import type { FieldAccess, PayloadRequest, Where } from 'payload'

import { isAdminManager, isManager } from './adminOnly'
import { getDocManagerFields, relationId, resolveManagedDocIds } from './documentManagers'

/** Collections whose writes are scoped to the region manager's owned-region subtree. */
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
 *
 * ⚠ **`keepCurrent` names the field whose stored value stays selectable, and a
 * document that can hold one owes it.** `validateFilterOptions` re-runs on
 * every save with no exemption for a value that did not change, so without it
 * two managers could not save a document they may edit: an event assignee owns
 * no region at all, and a region manager's own top region sits under a parent
 * above their subtree. Keeping the value is not permission to move it —
 * `scopeRegionSubtreeWrite` refuses an incoming region outside the subtree at
 * the row level, before any field runs.
 */
export async function ownedRegionFilterOptions(
  { data, req }: { data?: unknown; req: PayloadRequest },
  keepCurrent?: 'parent' | 'region',
): Promise<Where | boolean> {
  const user = req.user
  if (!isManager(user)) {
    return true
  }
  const ownedRegionIds = await resolveOwnedRegionIds(req, Number(user.id))
  const current = keepCurrent
    ? relationId((data as Record<string, unknown> | null | undefined)?.[keepCurrent])
    : null
  const selectable =
    current !== null && !ownedRegionIds.includes(current)
      ? [...ownedRegionIds, current]
      : ownedRegionIds
  return selectable.length ? { id: { in: selectable } } : false
}

/**
 * One relationship id off a stored row, for telling an unchanged posted value
 * from a real move. `overrideAccess` is deliberate: this answers a question
 * about the row the caller already reached, not about what they may read.
 */
async function storedRelationId(
  req: PayloadRequest,
  collection: 'events' | 'regions',
  id: number | string,
  field: 'parent' | 'region',
): Promise<null | number> {
  const doc = (await req.payload.findByID({
    collection,
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    select: { [field]: true },
    req,
  })) as Record<string, unknown> | null
  return doc ? relationId(doc[field]) : null
}

/** `Where` selecting events inside the owned subtree, unioned with directly-owned events. */
function eventScopeWhere(ownedRegionIds: number[], userId: number): Where {
  const or: Where[] = [{ manager: { equals: userId } }]
  // Skip an empty `in` (matches nothing, and some adapters dislike it) — the
  // manager clause alone still scopes correctly when the user owns no regions.
  if (ownedRegionIds.length) or.unshift({ region: { in: ownedRegionIds } })
  return or.length === 1 ? or[0]! : { or }
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
    // update (region delete isn't granted to a region manager). A re-parent must
    // keep the region inside the owned subtree — reject moving it under a region
    // they don't own.
    const newParentId = relationId((data as { parent?: unknown } | null)?.parent)
    if (id !== undefined) {
      if (!ownedRegionIds.includes(Number(id))) return false
      if (newParentId === null || ownedRegionIds.includes(newParentId)) return true
      // ⚠ **A posted parent that repeats the stored one is not a re-parent.**
      // Payload's admin posts the whole document, and a subtree ROOT's own
      // parent sits above the subtree — so refusing every outside parent
      // refused every save of the one region the manager is listed on. The
      // stored value is read only here, where the posted one is otherwise
      // about to be refused.
      return newParentId === (await storedRelationId(req, 'regions', id, 'parent'))
    }
    // Bulk update: no one stored value to compare, so an outside parent is a
    // re-parent attempt.
    if (newParentId !== null && !ownedRegionIds.includes(newParentId)) return false
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
  // region they don't own (delete carries no data, so this is a no-op there).
  const newRegionId = relationId((data as { region?: unknown } | null)?.region)
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
    const regionId = relationId(event.region)
    // ⚠ **A posted region that repeats the stored one is not a re-home.**
    // Payload's admin posts the whole document, and an event assignee owns no
    // region at all — so refusing every outside region refused every save of
    // the event their role comes from, which is also the save that
    // re-verifies it.
    if (newRegionId !== null && newRegionId !== regionId && !ownedRegionIds.includes(newRegionId)) {
      return false
    }
    if (regionId !== null && ownedRegionIds.includes(regionId)) return true
    return relationId(event.manager) === userId
  }
  // Bulk update: no one stored row to compare, so an outside region is a
  // re-home attempt.
  if (newRegionId !== null && !ownedRegionIds.includes(newRegionId)) return false
  return eventScopeWhere(ownedRegionIds, userId)
}

/**
 * Whether this request's user may hand out a role on a row sitting in
 * `regionId` — the test both `managers`-field locks below run.
 *
 * Writing such a field grants `atlas-region-manager` or `atlas-event-manager`,
 * because the listing **is** the role. So the write is admins, plus a region
 * manager whose own subtree holds the row — and never an event assignee, whose
 * grant on their event would otherwise let them reassign or disown it.
 *
 * With no row to judge — the capability call `/api/access` makes with no
 * document — it answers whether the user owns any region at all, the same
 * answer `scopeRegionSubtreeWrite` gives a create.
 */
async function maySetManagerOn(
  req: PayloadRequest,
  regionId: number | string | null | undefined,
): Promise<boolean> {
  if (isAdminManager(req.user)) return true
  if (!isManager(req.user)) return false

  const ownedRegionIds = await resolveOwnedRegionIds(req, Number(req.user.id))
  if (!ownedRegionIds.length) return false
  if (regionId === null || regionId === undefined) return true
  return ownedRegionIds.includes(Number(regionId))
}

/** `Regions.managers` — the row is the region, so its own id is the subtree test. */
export const regionManagersFieldAccess: FieldAccess = ({ id, req }) => maySetManagerOn(req, id)

/**
 * `Events.manager` — the event's region decides, read off the stored row. The
 * subtree test is about where the event sits, not where a caller proposes to
 * move it, and `scopeRegionSubtreeWrite` already refuses a move out of the
 * subtree at the row level. The rule is declared on `update` alone, so there is
 * always a stored row or no row at all.
 */
export const eventManagerFieldAccess: FieldAccess = ({ doc, req }) =>
  maySetManagerOn(req, relationId((doc as { region?: unknown } | undefined)?.region))
