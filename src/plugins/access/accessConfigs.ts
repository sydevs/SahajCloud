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
import type { AccessArgs, CollectionConfig, CollectionSlug, PayloadRequest, Where } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

import {
  getDocManagerFields,
  hasDocManagerAccess,
  resolveManagedDocIds,
  userManagesDocument,
} from './documentManagers'
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
        locale: req.locale === 'all' ? undefined : req.locale,
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
        locale: req.locale === 'all' ? undefined : req.locale,
        ...(fieldContext && { field: fieldContext }),
      }
      return hasPermission(args, bypassFn)
    }
  }

  return accessConfig
}
