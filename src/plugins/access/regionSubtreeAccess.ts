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

import { relationId } from '@/lib/utilities/relationId'

import { getDocManagerFields, resolveManagedDocIds } from './documentManagers'

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
function resolveOwnedRegionIds(req: PayloadRequest, userId: number): Promise<number[]> {
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
  if (user?.collection !== 'managers' || (user as { type?: string }).type !== 'manager') {
    return true
  }
  const ownedRegionIds = await resolveOwnedRegionIds(req, Number(user.id))
  return ownedRegionIds.length ? { id: { in: ownedRegionIds } } : false
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
    const regionId = relationId(event.region)
    if (regionId !== null && ownedRegionIds.includes(regionId)) return true
    return relationId(event.manager) === userId
  }
  return eventScopeWhere(ownedRegionIds, userId)
}
