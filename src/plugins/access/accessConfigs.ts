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
    accessConfig[operation] = async ({ req, id }: AccessArgs): Promise<boolean | Where> => {
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
