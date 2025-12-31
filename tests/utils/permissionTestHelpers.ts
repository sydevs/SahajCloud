/**
 * Permission Test Helpers
 *
 * Provides the same permission checking logic as production
 * by creating a permission checker with the same config.
 */

import { accessPluginConfig } from '../../src/config/accessConfig'
import { createPermissionChecker, buildPermissionLookup } from '../../src/lib/access'

// Build lookup tables from the same config as production
const lookup = buildPermissionLookup(accessPluginConfig.roles, accessPluginConfig.projects)

// Create permission checker with the same bypass functions as production
export const hasPermission = createPermissionChecker(lookup, accessPluginConfig.bypass)
