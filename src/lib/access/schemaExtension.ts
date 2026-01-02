/**
 * Schema Extension for Access Plugin
 *
 * Generates TypeScript types via PayloadCMS's typescript.schema configuration.
 * Adds ProjectSlug and RoleSlug types.
 */

import type { JSONSchema4 } from 'json-schema'

import { getProjectSlugs, getRoleSlugs } from './config'

/**
 * Create a typescript.schema function for generating role and project types
 *
 * This function is added to the typescript.schema array in payload.config.ts.
 * When `pnpm generate:types` runs, it will add the following types to payload-types.ts:
 *
 * - ProjectSlug: Union of project slugs
 * - RoleSlug: Union of all role slugs
 *
 * @returns Schema extension function for typescript.schema
 */
export function createSchemaExtension() {
  return function schemaExtension({ jsonSchema }: { jsonSchema: JSONSchema4; [key: string]: any }): JSONSchema4 {
    // Ensure definitions object exists
    if (!jsonSchema.definitions) {
      jsonSchema.definitions = {}
    }

    // Add ProjectSlug type using getProjectSlugs()
    jsonSchema.definitions.ProjectSlug = {
      type: 'string',
      enum: getProjectSlugs(),
    }

    // Add RoleSlug type using getRoleSlugs()
    jsonSchema.definitions.RoleSlug = {
      type: 'string',
      enum: getRoleSlugs(),
    }

    return jsonSchema
  }
}
