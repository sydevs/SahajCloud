/**
 * Schema Extension for Access Plugin
 *
 * Generates TypeScript types via PayloadCMS's typescript.schema configuration.
 * Adds ProjectSlug, ManagerRole, ClientRole, and PermissionLevel types.
 */

import type { AccessPluginOptions } from './types'
import type { JSONSchema4 } from 'json-schema'

import { getClientRoleSlugs, getManagerRoleSlugs, getProjectSlugs } from './lookupTables'

/**
 * Create a typescript.schema function for generating role and project types
 *
 * This function is added to the typescript.schema array in payload.config.ts.
 * When `pnpm generate:types` runs, it will add the following types to payload-types.ts:
 *
 * - ProjectSlug: Union of project slugs
 * - ManagerRole: Union of manager role slugs
 * - ClientRole: Union of client role slugs
 * - PermissionLevel: Union of permission operations
 *
 * @param options - Access plugin options
 * @returns Schema extension function for typescript.schema
 */
export function createSchemaExtension(options: AccessPluginOptions) {
  return function schemaExtension({ jsonSchema }: { jsonSchema: JSONSchema4 }): JSONSchema4 {
    // Extract slugs from config
    const projectSlugs = getProjectSlugs(options.projects)
    const managerRoleSlugs = getManagerRoleSlugs(options.roles)
    const clientRoleSlugs = getClientRoleSlugs(options.roles)

    // Ensure definitions object exists
    if (!jsonSchema.definitions) {
      jsonSchema.definitions = {}
    }

    // Add ProjectSlug type
    jsonSchema.definitions.ProjectSlug = {
      type: 'string',
      enum: projectSlugs,
    }

    // Add ManagerRole type
    jsonSchema.definitions.ManagerRole = {
      type: 'string',
      enum: managerRoleSlugs,
    }

    // Add ClientRole type
    jsonSchema.definitions.ClientRole = {
      type: 'string',
      enum: clientRoleSlugs,
    }

    // Note: PermissionLevel is defined in src/lib/access/types.ts (not generated)
    // because it's Operation | 'translate' which can't be represented in JSON schema

    return jsonSchema
  }
}
