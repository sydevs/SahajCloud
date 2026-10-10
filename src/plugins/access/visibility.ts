/**
 * Admin UI Visibility Functions
 *
 * This module provides functions for controlling collection/global visibility
 * in the PayloadCMS admin UI based on user permissions and project context.
 *
 * Functions:
 * - createHidden: Create hidden function for collections/globals
 * - resolveHidden: Compose a declared `admin.hidden` with the project rule
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

/** A `hidden` declaration as Payload accepts it, for either a collection or a global. */
type HiddenOption<TArgs> = boolean | ((args: TArgs) => boolean)

/**
 * Composes whatever an entity declared as `admin.hidden` with the project rule.
 *
 * `true` wins outright — it is the one way an entity hides itself from every
 * manager, admins included, and the plugin must not widen it back to the
 * project rule. A function is ORed with the project rule, so hiding is additive
 * in both directions. Anything else (`false`, absent) leaves the project rule
 * alone, because `false` here means "I have no opinion", not "always show me":
 * an entity that could opt out of project visibility would appear in the nav of
 * a project it has no place in.
 *
 * Collections and globals get the same answer from one function on purpose.
 * They carried two inline copies of it, and only the collections' copy honoured
 * a declaration at all — a global's was replaced outright (#883).
 */
export function resolveHidden<TArgs extends { user: unknown }>(
  declared: HiddenOption<TArgs> | undefined,
  slug: ContentSlug,
  bypassFn?: BypassPermissionFunction,
): HiddenOption<TArgs> {
  if (declared === true) return true

  const byProject = createHidden(slug, bypassFn)
  if (typeof declared !== 'function') return byProject

  return (args: TArgs) => declared(args) || byProject(args)
}
