/**
 * Role Configuration
 *
 * This module contains role configuration, computed lookup tables,
 * and helper functions for role-related access control.
 *
 * Contents:
 * - ROLES constant (internal)
 * - TRANSLATABLE_COLLECTIONS lookup (internal)
 * - Role helper functions (exported)
 */

import type { ContentSlug, PermissionLevel, VirtualRoleUser } from '../types'
import type { CollectionSlug } from 'payload'

import type { ProjectSlug } from '@/payload-types'

import { getAllProjectCollections, isCollectionVisibleInProject } from './projects'

// --- Internal Configuration (NOT exported - use helper functions) ---

/**
 * Role Configuration
 * All roles in a flat structure (manager roles + client roles with -client suffix).
 */
const ROLES = {
  // Manager roles
  'meditations-editor': {
    label: 'Meditations Editor',
    description: 'Can create and edit meditations, upload related media and files',
    project: 'wemeditate-app' as const,
    // The `meditations` grants are *scoped to the locale this role was assigned
    // in* by `scopeLocaleWrite` (localeScopedWrites.ts) — they are NOT
    // collection-wide despite appearing here, since a meditation is one
    // language. `narrators` is collection-wide on purpose: every language
    // shares them.
    permissions: {
      meditations: ['update', 'create'] as PermissionLevel[],
      narrators: ['update', 'create'] as PermissionLevel[],
      'user-choices': ['update'] as PermissionLevel[],
      images: ['create'] as PermissionLevel[],
      files: ['create'] as PermissionLevel[],
    },
  },
  'path-editor': {
    label: 'Path Editor',
    description: 'Can edit lessons and lectures; upload related media and files',
    project: 'wemeditate-app' as const,
    permissions: {
      lessons: ['update'] as PermissionLevel[],
      lectures: ['update', 'create'] as PermissionLevel[],
      images: ['create'] as PermissionLevel[],
      files: ['create'] as PermissionLevel[],
    },
  },
  'web-translator': {
    label: 'Web Translator',
    description: 'Can edit localized fields in pages, songs, and albums',
    project: 'wemeditate-web' as const,
    permissions: {
      pages: ['translate'] as PermissionLevel[],
      songs: ['translate'] as PermissionLevel[],
      albums: ['translate'] as PermissionLevel[],
    },
  },
  // --- Derived manager roles (never stored) ---
  //
  // Both are `virtual`: nobody assigns them, `virtualRoles` resolves them from
  // the `managedRegions` / `managedEvents` joins on every request, and the
  // listing is therefore the only record of who holds one. Removing someone
  // from a region or an event withdraws the role on their next request.
  'atlas-region-manager': {
    label: 'Atlas Region Manager',
    description: 'Manages events and regions within their own regions for Sahaj Atlas',
    project: 'sahaj-atlas' as const,
    virtual: { join: 'managedRegions' as const },
    // Read comes implicitly from project membership. These create/update/delete
    // grants are *scoped to the manager's owned-region subtree* in the access
    // layer (regionSubtreeAccess.ts) — they are NOT collection-wide despite
    // appearing here. Regions get create+update; events also get delete (trash).
    permissions: {
      regions: ['create', 'update'] as PermissionLevel[],
      events: ['create', 'update', 'delete'] as PermissionLevel[],
      // Starts a bulk class import. `imports` is restricted and declares its own
      // `access` (imports into their own regions), so this grants no read — it is what keeps
      // the collection's admin pages visible to a region manager at all, since
      // the access plugin hides a collection its role cannot write.
      imports: ['create'] as PermissionLevel[],
      // Collection-wide on purpose (#821): a picker exists to list *other*
      // managers, so a self-scoped `Where` would empty it.
      managers: ['read'] as PermissionLevel[],
      // `user-submissions` is restricted too, so this grant is what reaches it
      // at all — and it is narrowed per row in `accessConfigs.ts`: a manager
      // reads the contact rows addressed to them, plus the proposals in their
      // subtree. It does NOT open registrations or subscriptions to them.
      'user-submissions': ['read', 'update'] as PermissionLevel[],
      // ⚠ No `users` grant, on either Atlas role, deliberately. A row's
      // `senderEmail` is `virtual: 'user.email'` (#1060), so it reads as absent
      // for a manager. An event's Registrations view and the contact delivery
      // mail each read the address with `overrideAccess` instead.
    },
  },
  'atlas-event-manager': {
    label: 'Atlas Event Manager',
    description: 'Manages the Sahaj Atlas events they are assigned to',
    project: 'sahaj-atlas' as const,
    virtual: { join: 'managedEvents' as const },
    // Scoped to the events naming them, by the `manager == user` union in
    // regionSubtreeAccess.ts. No `users`, no `managers`, no `imports`: an
    // assignee runs one listing and needs no roster and no bulk import.
    permissions: {
      events: ['update', 'delete'] as PermissionLevel[],
      'user-submissions': ['read', 'update'] as PermissionLevel[],
    },
  },

  // Client roles (renamed with -client suffix)
  'wemeditate-web-client': {
    label: 'We Meditate Web',
    description: 'Access for We Meditate web frontend application',
    project: 'wemeditate-web' as const,
    permissions: {
      // All collections/globals get implicit read via project parameter
      // Only explicit permissions needed for non-read operations.
      // Create-only, and that is the whole grant: `user-submissions` is
      // restricted, so no read ever rides along with it.
      'user-submissions': ['create'] as PermissionLevel[],
    },
  },
  'wemeditate-app-client': {
    label: 'We Meditate App',
    description: 'Access for We Meditate mobile application',
    project: 'wemeditate-app' as const,
    // All collections/globals get implicit read via project parameter
    // No explicit permissions needed
    permissions: {},
  },
  'sahaj-atlas-client': {
    label: 'Sahaj Atlas',
    description: 'Access for Sahaj Atlas application',
    project: 'sahaj-atlas' as const,
    // All collections/globals get implicit read via project parameter.
    // `user-submissions` is create-ONLY, for every one of its four types: the
    // widget submits registrations, proposals and messages through the built-in
    // create endpoint (guarded by the write-guard plugin), but must never read
    // one back — the collection is restricted (sender addresses, free text).
    // There is deliberately **no update grant of any kind** (#723): the
    // registrant confirm/deny vote it used to carry was never written by a
    // client — the CMS-hosted `/registrations/feedback` page records it with
    // `overrideAccess`, and always did — so the old `registrations: ['update']`
    // grant, the uuid-scoped access branch, and the field whitelist beside it
    // were an open write path nothing used.
    permissions: {
      'user-submissions': ['create'] as PermissionLevel[],
    },
  },
} as const

// --- Internal Type Alias ---

/** Role slug type derived from ROLES constant */
type InternalRoleSlug = keyof typeof ROLES

// --- Computed Lookup Tables (internal only, computed at module load) ---

/**
 * Collections that have at least one role with translate permission
 * Computed once at module load from ROLES configuration
 * Used to determine if field-level access should be applied
 */
const TRANSLATABLE_COLLECTIONS: Set<CollectionSlug> = (() => {
  const collections = new Set<CollectionSlug>()
  Object.values(ROLES).forEach((roleConfig) => {
    Object.entries(roleConfig.permissions).forEach(([collection, permissions]) => {
      if (permissions.includes('translate' as PermissionLevel)) {
        collections.add(collection as CollectionSlug)
      }
    })
  })
  return collections
})()

// --- Type Generation Helper ---

/**
 * Get array of role slugs for TypeScript type generation
 * @returns Array of role slugs
 */
export function getRoleSlugs(): InternalRoleSlug[] {
  return Object.keys(ROLES) as InternalRoleSlug[]
}

// --- Role Helper Functions ---

/**
 * Get the project associated with a role
 * @param role - Role slug
 * @returns Project slug or undefined
 */
export function getRoleProject(role: InternalRoleSlug): ProjectSlug | undefined {
  const roleConfig = ROLES[role]
  return roleConfig?.project
}

/**
 * Get permissions for a single role (explicit only, no implicit reads)
 *
 * Used by PermissionsTable component and permission checking logic.
 *
 * @param role - Role slug
 * @returns Permissions object mapping collection slugs to permission levels
 */
export function getPermissionsForRole(role: InternalRoleSlug) {
  const roleConfig = ROLES[role]
  return (roleConfig?.permissions || {}) as Record<ContentSlug, PermissionLevel[]>
}

/**
 * The human label a role is shown under.
 *
 * Separate from `getRoleOptions` because a derived role has a label but is
 * never an option — the admin UI still has to name the ones a manager holds.
 */
export function getRoleLabel(role: InternalRoleSlug): string {
  return ROLES[role].label
}

/**
 * Get role options filtered by allowed roles
 * @param allowedRoles - Array of role slugs to include
 * @returns Array of role options with value and label
 * @throws Error if any role slug is invalid
 */
export function getRoleOptions(allowedRoles: InternalRoleSlug[]) {
  return allowedRoles.map((roleSlug) => {
    const roleConfig = ROLES[roleSlug]
    if (!roleConfig) {
      throw new Error(
        `Invalid role slug: "${roleSlug}". Valid roles are: ${Object.keys(ROLES).join(', ')}`,
      )
    }
    // ⚠ Offering a virtual role would write it into `roles`, where nothing
    // reads it and nothing removes it when the listing behind it goes away.
    // Thrown at config build, so a stray entry fails the boot rather than
    // shipping a select whose value grants nothing.
    if (virtualJoinOf(roleSlug) !== undefined) {
      throw new Error(
        `Role "${roleSlug}" is derived from a listing and cannot be assigned. ` +
          'Add or remove the manager on the region or event instead.',
      )
    }
    return { label: roleConfig.label, value: roleSlug }
  })
}

/** The join a derived role is read off, or nothing for a role that is stored. */
function virtualJoinOf(role: InternalRoleSlug): keyof VirtualRoleUser | undefined {
  const roleConfig = ROLES[role]
  return 'virtual' in roleConfig ? roleConfig.virtual.join : undefined
}

/**
 * The Atlas roles a manager holds by being listed, rather than by assignment.
 *
 * Being named on a region or an event *is* the role, so there is nothing to
 * keep in step: the grant appears on the request after the listing is saved
 * and is gone from the next request after it is removed. Which join each role
 * is read off is declared beside the role, so adding one is a table edit.
 *
 * ⚠ **A join carries at most its own `limit` of rows** (Payload's default is
 * 10), which is why this reads only whether `docs` is non-empty. It must never
 * ask *which* regions — `resolveOwnedRegionIds` answers that from a query, and
 * a truncated join would silently shrink a large country's subtree.
 */
export function virtualRoles(user: VirtualRoleUser): InternalRoleSlug[] {
  return getRoleSlugs().filter((role) => {
    const join = virtualJoinOf(role)
    return join !== undefined && !!user[join]?.docs?.length
  })
}

/**
 * Check if a collection has any role with translate permission
 * Used to determine if field-level access should be applied
 * @param collection - Collection slug
 * @returns True if collection has translate permissions
 */
export function isTranslatableCollection(collection: CollectionSlug): boolean {
  return TRANSLATABLE_COLLECTIONS.has(collection)
}

/**
 * Extract projects from a user's roles
 *
 * Handles both localized (managers) and flat array (clients) role formats.
 * Used by ProjectSelector and ProjectContext to determine allowed projects.
 *
 * @param roles - Roles in either format (localized Record or flat array)
 * @returns Array of unique project slugs
 */
export function getProjectsFromRoles(
  roles: InternalRoleSlug[] | Record<string, InternalRoleSlug[]> | undefined | null,
): ProjectSlug[] {
  if (!roles) return []

  // Flatten roles if localized (Record<locale, roles[]>)
  const allRoles: InternalRoleSlug[] = Array.isArray(roles)
    ? roles
    : (Object.values(roles).flat() as InternalRoleSlug[])

  // Map to projects and deduplicate
  const projects = new Set<ProjectSlug>()
  for (const role of allRoles) {
    const project = getRoleProject(role)
    if (project) projects.add(project)
  }

  return Array.from(projects)
}

/**
 * Get all collections with implicit read access for given roles
 *
 * This is a higher-level function that builds on isCollectionVisibleInProject.
 * For each role, it finds the associated project and adds all collections visible in that project.
 *
 * Includes:
 * - Project collections (collections in the role's project)
 * - Shared collections (collections not in any project, visible to all)
 *
 * @param roles - Array of role slugs
 * @returns Array of collection slugs readable by these roles
 */
export function getReadableCollections(roles: InternalRoleSlug[]): ContentSlug[] {
  const collections = new Set<ContentSlug>()

  // Get all collections visible for each role's project
  for (const role of roles) {
    const project = getRoleProject(role)
    // Use isCollectionVisibleInProject to check each collection
    // This ensures we use the same visibility logic everywhere
    getAllProjectCollections().forEach((collection) => {
      if (isCollectionVisibleInProject(collection, project || null)) {
        collections.add(collection)
      }
    })
  }

  return Array.from(collections).sort() as ContentSlug[]
}
