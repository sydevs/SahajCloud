/**
 * Document-Level Manager Access
 *
 * Collection-agnostic document-level access for managers. Any collection that
 * declares a `managers` (hasMany → managers) or `manager` (→ managers)
 * relationship grants read + update on its documents to the managers listed
 * there. A self-referential `parent` relationship lets a document inherit
 * managers from its ancestors, recursively.
 *
 * Fields are discovered by introspection — no collection slugs are hardcoded —
 * so the behavior applies to any collection that adds the conventional fields
 * (currently Pages, Regions, and Clients).
 *
 * Parent inheritance is resolved through the nested-docs `breadcrumbs` trail
 * (the ancestor chain `@payloadcms/plugin-nested-docs` maintains: `[root, …,
 * parent, self]`), which makes it depth-independent — ≤ 2 queries regardless of
 * tree depth. Collections with a bare `parent` and no `breadcrumbs` fall back to
 * a cycle-guarded recursive parent walk.
 *
 * All internal queries pass `overrideAccess: true` — they run *from inside* the
 * access layer, so re-running access checks would recurse infinitely.
 */

import type { ContentSlug } from './types'
import type { CollectionSlug, FlattenedField, Payload, PayloadRequest, Where } from 'payload'

export interface DocManagerFields {
  /** Name of the hasMany relationship → managers, if present. */
  managersField: string | null
  /** Name of the single relationship → managers, if present. */
  managerField: string | null
  /** Name of a self-referential `parent` relationship, if present. */
  parentField: string | null
  /** Whether a nested-docs `breadcrumbs` ancestor trail exists. */
  hasBreadcrumbs: boolean
}

const EMPTY_FIELDS: DocManagerFields = {
  managersField: null,
  managerField: null,
  parentField: null,
  hasBreadcrumbs: false,
}

/** True when the collection grants document-level access via a manager field. */
export function hasDocManagerAccess(fields: DocManagerFields): boolean {
  return Boolean(fields.managersField || fields.managerField)
}

function relationTargets(relationTo: string | string[], target: string): boolean {
  return Array.isArray(relationTo) ? relationTo.includes(target) : relationTo === target
}

/** Pull a numeric id out of a relationship value (id, populated doc, or string). */
export function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isInteger(n) ? n : null
  }
  if (value && typeof value === 'object' && 'id' in value) {
    return relationId((value as { id: unknown }).id)
  }
  return null
}

function detectDocManagerFields(fields: FlattenedField[], collection: string): DocManagerFields {
  const result: DocManagerFields = { ...EMPTY_FIELDS }
  for (const field of fields) {
    if (field.type === 'array' && field.name === 'breadcrumbs') {
      result.hasBreadcrumbs = true
    } else if (field.type === 'relationship') {
      const { name, relationTo } = field
      if (name === 'managers' && field.hasMany && relationTargets(relationTo, 'managers')) {
        result.managersField = name
      } else if (name === 'manager' && relationTargets(relationTo, 'managers')) {
        result.managerField = name
      } else if (name === 'parent' && relationTargets(relationTo, collection)) {
        result.parentField = name
      }
    }
  }
  return result
}

// Memoized per collection, keyed on the sanitized field array (stable at
// runtime). A WeakMap — rather than a slug-keyed Map — keeps unit tests that
// pass throwaway mock configs isolated from one another.
const fieldsCache = new WeakMap<FlattenedField[], DocManagerFields>()

/**
 * Introspect a collection for document-level manager fields. Returns no fields
 * for globals or unknown collections (they have no `flattenedFields`).
 */
export function getDocManagerFields(payload: Payload, collection: ContentSlug): DocManagerFields {
  const flattened = payload.collections?.[collection as CollectionSlug]?.config?.flattenedFields
  if (!flattened) return EMPTY_FIELDS
  const cached = fieldsCache.get(flattened)
  if (cached) return cached
  const result = detectDocManagerFields(flattened, collection)
  fieldsCache.set(flattened, result)
  return result
}

/** `Where` matching documents that list the user in a direct manager field. */
function directManagerWhere(userId: number | string, fields: DocManagerFields): Where {
  const or: Where[] = []
  if (fields.managersField) or.push({ [fields.managersField]: { in: [userId] } })
  if (fields.managerField) or.push({ [fields.managerField]: { equals: userId } })
  return { or }
}

/** True when a loaded document lists the user in one of its manager fields. */
function documentListsUser(
  doc: Record<string, unknown>,
  userId: number,
  fields: DocManagerFields,
): boolean {
  if (fields.managersField) {
    const value = doc[fields.managersField]
    if (Array.isArray(value) && value.some((entry) => relationId(entry) === userId)) return true
  }
  if (fields.managerField && relationId(doc[fields.managerField]) === userId) return true
  return false
}

/** Ancestor ids from a document's `breadcrumbs` trail, excluding the doc itself. */
function breadcrumbAncestorIds(doc: Record<string, unknown>, docId: number): number[] {
  const crumbs = doc.breadcrumbs
  if (!Array.isArray(crumbs)) return []
  const ids = crumbs
    .map((crumb) => relationId((crumb as { doc?: unknown })?.doc))
    .filter((id): id is number => id !== null && id !== docId)
  return [...new Set(ids)]
}

function loadDoc(
  req: PayloadRequest,
  collection: ContentSlug,
  id: number | string,
): Promise<Record<string, unknown> | null> {
  return req.payload.findByID({
    collection: collection as CollectionSlug,
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
    req,
  }) as Promise<Record<string, unknown> | null>
}

/** Walk down the `parent` tree from `rootIds`, cycle-guarded. */
async function walkDescendantsViaParent(
  req: PayloadRequest,
  collection: ContentSlug,
  rootIds: number[],
  parentField: string,
): Promise<number[]> {
  const found = new Set<number>()
  const visited = new Set<number>(rootIds)
  let frontier = rootIds
  while (frontier.length) {
    const children = await req.payload.find({
      collection: collection as CollectionSlug,
      where: { [parentField]: { in: frontier } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    const next: number[] = []
    for (const child of children.docs) {
      const id = child.id as number
      if (visited.has(id)) continue
      visited.add(id)
      found.add(id)
      next.push(id)
    }
    frontier = next
  }
  return [...found]
}

/** Ids of the roots the user directly manages plus every descendant of those roots. */
export async function resolveManagedDocIds(
  req: PayloadRequest,
  collection: ContentSlug,
  userId: number | string,
  fields: DocManagerFields,
): Promise<number[]> {
  const roots = await req.payload.find({
    collection: collection as CollectionSlug,
    where: directManagerWhere(userId, fields),
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const rootIds = roots.docs.map((doc) => doc.id as number)
  if (!rootIds.length) return []

  let descendantIds: number[] = []
  if (fields.hasBreadcrumbs) {
    // One query: every doc whose breadcrumb trail contains a managed root.
    // A doc's own breadcrumbs include itself, so the roots come back here too —
    // harmless, since they're unioned with rootIds below.
    const descendants = await req.payload.find({
      collection: collection as CollectionSlug,
      where: { 'breadcrumbs.doc': { in: rootIds } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    descendantIds = descendants.docs.map((doc) => doc.id as number)
  } else if (fields.parentField) {
    descendantIds = await walkDescendantsViaParent(req, collection, rootIds, fields.parentField)
  }

  return [...new Set([...rootIds, ...descendantIds])]
}

/** Walk up the `parent` chain from a loaded doc, cycle-guarded. */
async function userManagesAncestorViaParent(
  req: PayloadRequest,
  collection: ContentSlug,
  userId: number,
  doc: Record<string, unknown>,
  fields: DocManagerFields,
): Promise<boolean> {
  const visited = new Set<number>([Number(doc.id)])
  let current = doc
  for (;;) {
    const parentId = relationId(current[fields.parentField!])
    if (parentId === null || visited.has(parentId)) return false
    visited.add(parentId)
    const parent = await loadDoc(req, collection, parentId)
    if (!parent) return false
    if (documentListsUser(parent, userId, fields)) return true
    current = parent
  }
}

/**
 * True when the user may read + update a single document — either listed on it
 * directly or on one of its ancestors.
 */
export async function userManagesDocument(
  req: PayloadRequest,
  collection: ContentSlug,
  userId: number | string,
  docId: number | string,
  fields: DocManagerFields,
): Promise<boolean> {
  const doc = await loadDoc(req, collection, docId)
  if (!doc) return false

  const uid = Number(userId)
  if (documentListsUser(doc, uid, fields)) return true

  if (fields.hasBreadcrumbs) {
    const ancestorIds = breadcrumbAncestorIds(doc, Number(docId))
    if (!ancestorIds.length) return false
    const hit = await req.payload.find({
      collection: collection as CollectionSlug,
      where: { and: [{ id: { in: ancestorIds } }, directManagerWhere(uid, fields)] },
      depth: 0,
      limit: 1,
      overrideAccess: true,
      req,
    })
    return hit.docs.length > 0
  }

  if (fields.parentField) {
    return userManagesAncestorViaParent(req, collection, uid, doc, fields)
  }

  return false
}
