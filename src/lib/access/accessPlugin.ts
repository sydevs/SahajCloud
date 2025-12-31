/**
 * Access Plugin for PayloadCMS
 *
 * Consolidates Role-Based Access Control (RBAC) and Project Visibility
 * into a single plugin. Provides:
 *
 * - Pre-computed O(1) permission checking via lookup tables
 * - Automatic access control application to collections
 * - Automatic admin.hidden application based on project config
 * - Automatic field-level access for localized fields
 * - Type generation via typescript.schema
 *
 * @example
 * ```typescript
 * import { accessPlugin } from '@/lib/access'
 *
 * export default buildConfig({
 *   plugins: [
 *     accessPlugin({
 *       projects: { ... },
 *       roles: { managers: { ... }, clients: { ... } },
 *       bypass: { ... },
 *     }),
 *   ],
 * })
 * ```
 */

import type { AccessPluginOptions } from './types'
import type { Config, Plugin } from 'payload'

import { applyLocalizedFieldAccess } from './localizedFields'
import { buildPermissionLookup, buildProjectLookup } from './lookupTables'
import { createCollectionAccess, createGlobalAccess, createPermissionChecker } from './permissions'
import { createSchemaExtension } from './schemaExtension'
import { AUTH_COLLECTIONS } from './types'
import { adminOnlyHidden, createCollectionHiddenFunction, createGlobalHiddenFunction } from './visibility'

/**
 * Create the access plugin
 *
 * @param options - Plugin configuration
 * @returns PayloadCMS plugin
 */
export function accessPlugin(options: AccessPluginOptions): Plugin {
  // Build lookup tables at plugin load time (once)
  const permissionLookup = buildPermissionLookup(options.roles, options.projects)
  const projectLookup = buildProjectLookup(options.projects)

  // Create permission checker with lookup tables bound
  const hasPermission = createPermissionChecker(permissionLookup, options.bypass)

  return (incomingConfig: Config): Config => {
    const config = { ...incomingConfig }

    // Process collections
    if (config.collections) {
      config.collections = config.collections.map((collection) => {
        const slug = collection.slug

        // Skip auth collections (they use adminOrSelfAccess)
        if (AUTH_COLLECTIONS.includes(slug)) {
          // Still apply hidden function for project visibility
          return {
            ...collection,
            admin: {
              ...collection.admin,
              hidden: adminOnlyHidden,
            },
          }
        }

        // Apply access control, visibility, and field access
        return {
          ...collection,
          // Apply role-based access control
          access: {
            ...createCollectionAccess(hasPermission, slug),
            // Preserve any existing access overrides
            ...collection.access,
          },
          admin: {
            ...collection.admin,
            // Apply project-based visibility
            hidden: createCollectionHiddenFunction(projectLookup, hasPermission, slug),
          },
          // Apply localized field access
          fields: applyLocalizedFieldAccess(collection.fields || [], slug, hasPermission),
        }
      })
    }

    // Process globals
    if (config.globals) {
      config.globals = config.globals.map((global) => {
        const slug = global.slug

        return {
          ...global,
          // Apply role-based access control
          access: {
            ...createGlobalAccess(hasPermission, slug),
            // Preserve any existing access overrides
            ...global.access,
          },
          admin: {
            ...global.admin,
            // Apply project-based visibility
            hidden: createGlobalHiddenFunction(projectLookup, hasPermission, slug),
          },
        }
      })
    }

    // Add typescript.schema extension for type generation
    const existingSchema = config.typescript?.schema
    const schemaArray = existingSchema
      ? Array.isArray(existingSchema)
        ? existingSchema
        : [existingSchema]
      : []

    config.typescript = {
      ...config.typescript,
      schema: [...schemaArray, createSchemaExtension(options)],
    }

    return config
  }
}

// Re-export types and utilities for consumers
export { isAPIClient, createFieldAccess, createPermissionChecker } from './permissions'
export { adminOnlyHidden } from './visibility'
export type {
  AccessPluginOptions,
  BypassResult,
  ClientBypassArgs,
  ClientBypassFn,
  ClientRoleConfig,
  ManagerBypassArgs,
  ManagerBypassFn,
  ManagerRoleConfig,
  PermissionCheckArgs,
  PermissionLevel,
  ProjectConfig,
  TypedClient,
  TypedManager,
} from './types'
export { AUTH_COLLECTIONS, RESTRICTED_COLLECTIONS } from './types'
export { getManagerRoleSlugs, getClientRoleSlugs, getProjectSlugs, getRoleProject } from './lookupTables'
