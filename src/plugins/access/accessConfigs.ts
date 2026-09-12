/**
 * Access Configuration Factory
 *
 * This module provides functions for creating access configurations
 * for PayloadCMS collections, globals, and fields.
 *
 * Functions:
 * - createAccessConfig: Create access config for collections/globals
 * - createFieldAccessConfig: Create access config for field-level access
 */

import type { BypassPermissionFunction, ContentSlug, FieldAccessConfig } from './types'
import type {
  Access,
  AccessArgs,
  CollectionConfig,
  CollectionSlug,
  PayloadRequest,
  Where,
} from 'payload'

import { appendVersionToQueryKey, hasWhereAccessResult } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

import {
  getDocManagerFields,
  hasDocManagerAccess,
  resolveManagedDocIds,
  userManagesDocument,
} from './documentManagers'
import { roleScopeFromLocale } from './localizedRoles'
import { hasPermission } from './permissions'
import { isRegionSubtreeCollection, scopeRegionSubtreeWrite } from './regionSubtreeAccess'

/**
 * Check if a collection has drafts enabled
 * Uses req.payload to access collection config at runtime
 *
 * @param req - PayloadRequest with access to payload instance
 * @param collectionSlug - Collection slug to check
 * @returns true if collection has drafts enabled
 */
function collectionHasDrafts(req: PayloadRequest, collectionSlug: string): boolean {
  const collection = req.payload.collections[collectionSlug as CollectionSlug]
  return !!collection?.config?.versions?.drafts
}

/**
 * True for an active, non-admin manager (`type === 'manager'`). Admins are
 * already granted by the bypass; inactive managers are denied there. This is
 * the only user class eligible for document-level manager access.
 */
function isActiveNonAdminManager(user: PayloadRequest['user']): boolean {
  return user?.collection === 'managers' && (user as { type?: string }).type === 'manager'
}

/**
 * The registration uuid a client's vote request proves possession of —
 * `?registrationUuid=` (REST query) with a `req.query` fallback for
 * handler-forwarded requests.
 */
/**
 * The `?registrationUuid=` a registrant proves possession of to vote.
 *
 * `req.query` only — that *is* Payload's parsed query: `createPayloadRequest`
 * runs the search string through `qs-esm` and sets `query` alongside
 * `searchParams` on every REST request, so a second read of `searchParams`
 * could never see anything `query` had missed. It was here anyway, and the
 * spec's hand-built request couldn't tell: it set `query` and no
 * `searchParams`, so it only ever exercised the branch that survives.
 */
function extractRegistrationUuid(req: PayloadRequest): string | null {
  const uuid = (req.query as Record<string, unknown> | undefined)?.registrationUuid
  return typeof uuid === 'string' && uuid ? uuid : null
}

/**
 * Create unified access config for collections and globals
 *
 * @param collection - Collection slug
 * @param operations - Operations to create access handlers for
 * @param bypassFn - Optional bypass function
 * @returns Access config object with specified operations
 */
export function createAccessConfig(
  collection: ContentSlug,
  operations: Array<'read' | 'create' | 'update' | 'delete'>,
  bypassFn?: BypassPermissionFunction,
): CollectionConfig['access'] {
  const accessConfig: CollectionConfig['access'] = {}

  for (const operation of operations) {
    accessConfig[operation] = async ({ req, id, data }: AccessArgs): Promise<boolean | Where> => {
      const args = {
        user: req.user,
        collection,
        operation,
        locale: roleScopeFromLocale(req.locale),
        ...(id && { docId: id }),
      }

      const hasAccess = hasPermission(args, bypassFn)

      if (hasAccess) {
        if (
          operation === 'read' &&
          req.user?.collection === 'clients' &&
          collectionHasDrafts(req, collection) &&
          !hasValidPreviewSecret(req) // External connections must use preview secret
        ) {
          // Restrict to published only unless all requirements are met.
          //
          // ⚠ On `pages` and `app-cards` this clause is now **per locale**:
          // `versions.drafts.localizeStatus` moved `_status` into their
          // `_locales` tables, and Drizzle scopes the same `Where` to the
          // requested locale. The clause is unchanged and load-bearing — with
          // it removed, a read at `?locale=de` returns the German text of a
          // locale the editor unpublished (measured, #718). It also means a
          // page published in English alone returns nothing at `?locale=de`,
          // which is the point rather than a regression.
          return { _status: { equals: 'published' } }
        }

        // An atlas-manager's role grants create/update/delete on regions/events,
        // but only within the region subtree they own — narrow the collection-
        // wide grant to a scoped Where (or boolean). See regionSubtreeAccess.ts.
        if (
          operation !== 'read' &&
          isActiveNonAdminManager(req.user) &&
          isRegionSubtreeCollection(collection)
        ) {
          return scopeRegionSubtreeWrite({ req, collection, operation, id, data })
        }

        // A client's registrations `update` grant (the confirm/deny vote) is
        // scoped to the one registration whose unguessable `uuid` the caller
        // proves it holds — `?registrationUuid=` on the request. No param, no
        // access; a mismatched uuid resolves to Not Found. The uuid is the
        // credential (it's only ever revealed in the register response), so no
        // login is needed. See registrations' eventFeedback hooks for the
        // field whitelist + vote gate this composes with.
        if (
          operation === 'update' &&
          req.user?.collection === 'clients' &&
          collection === 'registrations'
        ) {
          const uuid = extractRegistrationUuid(req)
          return uuid ? { uuid: { equals: uuid } } : false
        }

        return true
      }

      // Role-based access denied. An active non-admin manager may still reach
      // read/update on documents that list them (or an ancestor) via a manager
      // field — see documentManagers.ts. This DB-touching path runs only after
      // the query-free permission check has already failed.
      if ((operation === 'read' || operation === 'update') && isActiveNonAdminManager(req.user)) {
        const fields = getDocManagerFields(req.payload, collection)
        if (hasDocManagerAccess(fields)) {
          const userId = req.user!.id
          // Single-document update → boolean; read or bulk update → constrain
          // the query to the managed set (or deny outright when it's empty).
          if (operation === 'update' && id !== undefined) {
            return userManagesDocument(req, collection, userId, id, fields)
          }
          const ids = await resolveManagedDocIds(req, collection, userId, fields)
          return ids.length ? { id: { in: ids } } : false
        }
      }

      return false
    }
  }

  return accessConfig
}

/**
 * The access keys this plugin DERIVES from `update` rather than computes from
 * the role tables — the operations that are EDIT authority wearing another
 * name: version history (#719) and clearing a login lockout (#748).
 *
 * They share one failure. Left unwritten, Payload answers each from a
 * permissive default — `Boolean(user)` for `unlock`, from its collection
 * defaults, and the same `defaultAccess` fallback in `executeAccess` for an
 * unset `readVersions` — which a published client's API key satisfies. So
 * they share one derivation, and the differences between them fit in this
 * table.
 *
 * `admin` is the one collection access key left unwritten, and it does NOT
 * belong here: it gates the admin panel for `config.admin.user` alone, so no
 * client key reaches it, and `update` is not its authority. See "The one key
 * still unwritten" in `docs/rules/access.md`.
 */
type DerivedGrantKey = 'readVersions' | 'unlock'

type DerivedGrant = {
  /**
   * Rewrite a `Where` from `update` — which queries DOCUMENTS — onto the
   * collection this operation actually runs over. Absent means the operation
   * queries the same documents `update` already answers about.
   */
  translateWhere?: (where: Where) => Where
}

const DERIVED_GRANTS: Record<DerivedGrantKey, DerivedGrant> = {
  // ⚠ A versions query runs over VERSION ROWS, where a document's fields sit
  // under `version.` and its id is `parent`. Skip the translation and
  // `{ id: { in: [7] } }` matches version rows by their own primary key — a
  // wrong answer that still returns documents.
  readVersions: { translateWhere: appendVersionToQueryKey },
  // `unlock` queries the auth collection itself, which is what `update`
  // already answers about. No translation.
  unlock: {},
}

/**
 * Derive each named grant from the config's own `update`, unless it is already
 * set. Whoever may edit an entity reads its version history and clears its
 * login lockout. Nobody else.
 *
 * Why `update` is the authority, and what each key exposed before: "Version
 * history is edit authority" and "Unlocking an account is edit authority" in
 * `docs/rules/access.md`.
 *
 * ⚠ Wrap the MERGED access config, after any per-entity override. Deriving
 * inside `createAccessConfig` binds the grant to an `update` the override has
 * already replaced — which is the drift the delegation exists to prevent.
 */
export function withDerivedGrants<
  T extends Partial<Record<DerivedGrantKey, Access>> & { update?: Access },
>(access: T, keys: readonly DerivedGrantKey[]): T {
  const { update } = access
  const derived: Partial<Record<DerivedGrantKey, Access>> = {}

  for (const key of keys) {
    if (access[key]) continue
    const { translateWhere } = DERIVED_GRANTS[key]

    // ⚠ Fail CLOSED when there is no `update` to delegate to. Returning the
    // config untouched instead leaves the key unset, and Payload refills an
    // unset key with the permissive default this function exists to remove.
    // Unreachable today — `createAccessConfig` always assigns `update` — but
    // that silence is exactly how #719 and #748 shipped.
    derived[key] = update
      ? // ⚠ Drop the id. `findVersionByID` passes the VERSION ROW's primary
        // key, not the document's, so every id-sensitive branch of `update`
        // would answer about the wrong document. `unlockOperation` passes no
        // id at all, and dropping it keeps that true if a future Payload
        // passes one, rather than letting the self-access bypass
        // (`user.id === docId`) hand an account its own unlock. Dropped,
        // `update` answers at the list level, and `findVersionByID` ANDs the
        // row id back on itself.
        async ({ id: _id, ...args }) => {
          const result = await update(args)
          return translateWhere && hasWhereAccessResult(result)
            ? translateWhere(result)
            : result
        }
      : () => false
  }

  return { ...access, ...derived }
}

/**
 * Create access config for field-level access control
 * Used for non-localized fields in translatable collections
 *
 * @param collection - Collection slug
 * @param operations - Operations to create access handlers for
 * @param bypassFn - Optional bypass function
 * @param fieldContext - Field context (e.g., { localized: false })
 * @returns Field access config object with specified operations
 */
export function createFieldAccessConfig(
  collection: ContentSlug,
  operations: Array<'read' | 'create' | 'update'>,
  bypassFn?: BypassPermissionFunction,
  fieldContext?: { localized: boolean },
): FieldAccessConfig {
  const accessConfig: FieldAccessConfig = {}

  for (const operation of operations) {
    accessConfig[operation] = ({ req }: { req: PayloadRequest }) => {
      const args = {
        user: req.user,
        collection,
        operation,
        locale: roleScopeFromLocale(req.locale),
        ...(fieldContext && { field: fieldContext }),
      }
      return hasPermission(args, bypassFn)
    }
  }

  return accessConfig
}
