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
import type { AccessArgs, CollectionConfig, CollectionSlug, PayloadRequest } from 'payload'

import { hasPermission } from './permissions'

const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

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
    accessConfig[operation] = ({ req, id }: AccessArgs) => {
      const args = {
        user: req.user,
        collection,
        operation,
        locale: req.locale === 'all' ? undefined : req.locale,
        ...(id && { docId: id }),
      }

      const hasAccess = hasPermission(args, bypassFn)

      if (
        hasAccess &&
        operation === 'read' &&
        req.user?.collection === 'clients' &&
        collectionHasDrafts(req, collection) &&
        req.headers?.get?.(PREVIEW_SECRET_HEADER) !== process.env.SAHAJCLOUD_PREVIEW_SECRET // External connections must use preview secret
      ) {
        // Restrict to published only unless all requirements are met.
        return { _status: { equals: 'published' } }
      }

      return hasAccess
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
