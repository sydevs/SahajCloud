/**
 * Lookup Table Builders for Access Plugin
 *
 * Builds pre-computed lookup structures at plugin initialization time
 * for O(1) permission checking at runtime.
 */

import type {
  AccessPluginOptions,
  ClientRoleConfig,
  ManagerRoleConfig,
  PermissionLevel,
  PermissionLookup,
  ProjectLookup,
} from './types'

/**
 * Build permission lookup tables from role definitions
 *
 * Creates Map<roleSlug, Map<collectionSlug, Set<operation>>> for both managers and clients.
 * For managers, also adds implicit read permissions from project associations.
 *
 * @param roles - Role definitions from plugin options
 * @param projects - Project definitions from plugin options (for implicit read)
 * @returns Pre-computed permission lookup table
 */
export function buildPermissionLookup(
  roles: AccessPluginOptions['roles'],
  projects: AccessPluginOptions['projects'],
): PermissionLookup {
  const managerLookup = new Map<string, Map<string, Set<PermissionLevel>>>()
  const clientLookup = new Map<string, Map<string, Set<PermissionLevel>>>()

  // Build project -> collections mapping for implicit read
  const projectCollections = new Map<string, Set<string>>()
  for (const [projectSlug, projectConfig] of Object.entries(projects)) {
    projectCollections.set(projectSlug, new Set(projectConfig.collections))
    // Include globals in implicit read
    if (projectConfig.globals) {
      for (const global of projectConfig.globals) {
        projectCollections.get(projectSlug)!.add(global)
      }
    }
  }

  // Build manager role permissions
  for (const [roleSlug, roleConfig] of Object.entries(roles.managers) as [
    string,
    ManagerRoleConfig,
  ][]) {
    const collectionMap = new Map<string, Set<PermissionLevel>>()

    // Add explicit permissions
    for (const [collection, permissions] of Object.entries(roleConfig.permissions)) {
      collectionMap.set(collection, new Set(permissions))
    }

    // Add implicit read from project association
    const projectColls = projectCollections.get(roleConfig.project)
    if (projectColls) {
      for (const collection of projectColls) {
        if (!collectionMap.has(collection)) {
          collectionMap.set(collection, new Set(['read']))
        } else {
          collectionMap.get(collection)!.add('read')
        }
      }
    }

    managerLookup.set(roleSlug, collectionMap)
  }

  // Build client role permissions
  for (const [roleSlug, roleConfig] of Object.entries(roles.clients) as [
    string,
    ClientRoleConfig,
  ][]) {
    const collectionMap = new Map<string, Set<PermissionLevel>>()

    // Add explicit permissions only (no implicit read for clients)
    for (const [collection, permissions] of Object.entries(roleConfig.permissions)) {
      collectionMap.set(collection, new Set(permissions))
    }

    clientLookup.set(roleSlug, collectionMap)
  }

  return {
    managers: managerLookup,
    clients: clientLookup,
  }
}

/**
 * Build project lookup tables from project definitions
 *
 * Creates bidirectional mappings:
 * - collection -> projects (which projects include this collection)
 * - global -> projects (which projects include this global)
 * - project -> collections (which collections are in this project)
 *
 * @param projects - Project definitions from plugin options
 * @returns Pre-computed project lookup table
 */
export function buildProjectLookup(projects: AccessPluginOptions['projects']): ProjectLookup {
  const collectionToProjects = new Map<string, Set<string>>()
  const globalToProjects = new Map<string, Set<string>>()
  const projectToCollections = new Map<string, Set<string>>()

  for (const [projectSlug, projectConfig] of Object.entries(projects)) {
    // Build project -> collections mapping
    projectToCollections.set(projectSlug, new Set(projectConfig.collections))

    // Build collection -> projects mapping
    for (const collection of projectConfig.collections) {
      if (!collectionToProjects.has(collection)) {
        collectionToProjects.set(collection, new Set())
      }
      collectionToProjects.get(collection)!.add(projectSlug)
    }

    // Build global -> projects mapping
    if (projectConfig.globals) {
      for (const global of projectConfig.globals) {
        if (!globalToProjects.has(global)) {
          globalToProjects.set(global, new Set())
        }
        globalToProjects.get(global)!.add(projectSlug)
      }
    }
  }

  return {
    collections: collectionToProjects,
    globals: globalToProjects,
    projectCollections: projectToCollections,
  }
}

/**
 * Get all project slugs from plugin options
 *
 * @param projects - Project definitions from plugin options
 * @returns Array of project slug strings
 */
export function getProjectSlugs(projects: AccessPluginOptions['projects']): string[] {
  return Object.keys(projects)
}

/**
 * Get all manager role slugs from plugin options
 *
 * @param roles - Role definitions from plugin options
 * @returns Array of manager role slug strings
 */
export function getManagerRoleSlugs(roles: AccessPluginOptions['roles']): string[] {
  return Object.keys(roles.managers)
}

/**
 * Get all client role slugs from plugin options
 *
 * @param roles - Role definitions from plugin options
 * @returns Array of client role slug strings
 */
export function getClientRoleSlugs(roles: AccessPluginOptions['roles']): string[] {
  return Object.keys(roles.clients)
}

/**
 * Get the project associated with a manager role
 *
 * @param roles - Role definitions from plugin options
 * @param roleSlug - The manager role slug
 * @returns Project slug or undefined if role not found
 */
export function getRoleProject(
  roles: AccessPluginOptions['roles'],
  roleSlug: string,
): string | undefined {
  return roles.managers[roleSlug]?.project
}

/**
 * Check if a role has any permissions (for implicit read check)
 *
 * @param lookup - Permission lookup table
 * @param roleSlug - Role slug to check
 * @param isClient - Whether this is a client role
 * @returns True if role has any permissions configured
 */
export function roleHasAnyPermissions(
  lookup: PermissionLookup,
  roleSlug: string,
  isClient: boolean,
): boolean {
  const lookupTable = isClient ? lookup.clients : lookup.managers
  const collectionMap = lookupTable.get(roleSlug)
  return collectionMap !== undefined && collectionMap.size > 0
}
