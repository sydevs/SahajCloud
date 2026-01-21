/**
 * Access Plugin for PayloadCMS
 *
 * Main plugin orchestration that applies role-based access control
 * and project visibility to all collections and globals.
 *
 * This module imports from focused sub-modules:
 * - permissions.ts: hasPermission, hasAnyPermission
 * - accessConfigs.ts: createAccessConfig
 * - fieldAccess.ts: applyFieldAccessForTranslatableCollections
 * - visibility.ts: createHidden
 */

import type { BypassPermissionFunction, ContentSlug } from './types'
import type { ClientUser, CollectionSlug, Config } from 'payload'

import { createAccessConfig } from './accessConfigs'
import { getProjectSlugs, getRoleSlugs, isTranslatableCollection } from './config'
import { applyFieldAccessForTranslatableCollections } from './fieldAccess'
import { createHidden } from './visibility'

// Re-export permission functions for public API
export { hasPermission, hasAnyPermission } from './permissions'

// ============================================================================
// PLUGIN OPTIONS
// ============================================================================

export interface AccessPluginOptions {
  /** Whether to enable the plugin */
  enabled?: boolean
  /** Bypass function for custom access logic (inactive users, admins, etc.) */
  bypassPermissions?: BypassPermissionFunction
}

// ============================================================================
// MAIN PLUGIN EXPORT
// ============================================================================

/**
 * Access Plugin for PayloadCMS
 *
 * Applies role-based access control and project visibility to all collections and globals.
 *
 * @param options - Plugin configuration
 * @returns PayloadCMS plugin
 *
 * @example
 * ```typescript
 * plugins: [
 *   accessPlugin({
 *     enabled: true,
 *     bypassPermissions: (user, context) => {
 *       if (user.collection === 'managers') {
 *         if (user.type === 'inactive') return 'deny'
 *         if (user.type === 'admin') return 'allow'
 *       }
 *       return 'continue'
 *     },
 *   }),
 * ]
 * ```
 */
export function accessPlugin(options: AccessPluginOptions = {}): (config: Config) => Config {
  const { enabled = true, bypassPermissions } = options

  // If disabled, return no-op
  if (!enabled) {
    return (config: Config) => config
  }

  return (config: Config): Config => {
    return {
      ...config,

      // Apply to collections
      collections: config.collections?.map((collection) => {
        const slug = collection.slug as CollectionSlug
        return {
          ...collection,
          // Apply role-based access control (preserve existing overrides)
          access: {
            ...createAccessConfig(slug, ['read', 'create', 'update', 'delete'], bypassPermissions),
            ...collection.access,
          },
          admin: {
            ...collection.admin,
            // Respect existing hidden config, otherwise apply project-based visibility
            hidden:
              collection.admin?.hidden === true
                ? true
                : typeof collection.admin?.hidden === 'function'
                  ? (args) => {
                      // If original hidden returns true, respect it
                      if (
                        typeof collection.admin?.hidden === 'function' &&
                        collection.admin!.hidden!(args)
                      )
                        return true

                      // Otherwise, apply project-based visibility
                      return createHidden(slug, bypassPermissions)(args)
                    }
                  : createHidden(slug, bypassPermissions),
          },
          // Only apply field-level access if collection has translate permissions
          fields: isTranslatableCollection(slug)
            ? applyFieldAccessForTranslatableCollections(
                collection.fields || [],
                slug,
                bypassPermissions,
              )
            : collection.fields || [],
        }
      }),

      // Apply to globals
      globals: config.globals?.map((global) => {
        const slug = global.slug as ContentSlug
        return {
          ...global,
          // Apply role-based access control (preserve existing overrides)
          access: {
            ...createAccessConfig(slug, ['read', 'update'], bypassPermissions),
            ...global.access,
          },
          admin: {
            ...global.admin,
            // Apply project-based visibility
            hidden: createHidden(slug, bypassPermissions),
          },
        }
      }),

      // Add TypeScript schema extension for ProjectSlug and RoleSlug types
      typescript: {
        ...config.typescript,
        schema: [
          ...(config.typescript?.schema || []),
          ({ jsonSchema }) => {
            if (!jsonSchema.definitions) {
              jsonSchema.definitions = {}
            }
            jsonSchema.definitions.ProjectSlug = {
              type: 'string',
              enum: getProjectSlugs(),
            }
            jsonSchema.definitions.RoleSlug = {
              type: 'string',
              enum: getRoleSlugs(),
            }
            return jsonSchema
          },
        ],
      },
    }
  }
}
