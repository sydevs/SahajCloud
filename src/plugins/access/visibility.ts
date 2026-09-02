/**
 * Admin UI Visibility Functions
 *
 * This module provides functions for controlling collection/global visibility
 * in the PayloadCMS admin UI based on user permissions and project context.
 *
 * Functions:
 * - createHidden: Create hidden function for collections/globals
 */

import type { BypassPermissionFunction, ContentSlug, TypedAuthUser } from './types'

import { isCollectionVisibleInProject } from './config'
import { hasAnyPermission } from './permissions'

/**
 * Create unified hidden function for collections and globals
 * No wrappers - used directly throughout the plugin
 *
 * Collection/global is hidden if:
 * - User has no permission for checkOperations
 * - User's currentProject doesn't match allowed projects
 *
 * @param slug - Collection or global slug
 * @param bypassFn - Optional bypass function
 * @returns Hidden function for admin UI
 */
export function createHidden(slug: ContentSlug, bypassFn?: BypassPermissionFunction) {
  // Use unknown to accommodate both CollectionConfig (ClientUser) and GlobalConfig (Manager | Client)
  return (args: { user: unknown }): boolean => {
    const user = args.user as TypedAuthUser | null
    if (!user) return true

    // Check if user has any write permission.
    //
    // ⚠ `locale: 'union'` is load-bearing. Payload calls `hidden({ user })` with no
    // locale at all, and `getVisibleEntities` treats a throw as hidden — so scoping
    // this to a single locale (or to none) would empty the nav of every collection
    // and global for every non-admin manager. Nav visibility is not the access
    // boundary; the per-locale check on the collection itself is (#665).
    const hasWrite = hasAnyPermission(
      {
        user,
        collection: slug,
        locale: 'union',
        operations: ['create', 'update', 'delete'],
      },
      bypassFn,
    )
    if (!hasWrite) return true

    // Check project visibility using unified logic
    return !isCollectionVisibleInProject(slug, user.currentProject ?? null)
  }
}
