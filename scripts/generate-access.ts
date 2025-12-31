/**
 * Generate Access Data
 *
 * This script reads the accessPluginConfig from payload.config.ts and generates
 * src/generated/access.ts with lookup tables for both server and client contexts.
 *
 * Run: pnpm generate:access
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Types matching accessPluginConfig structure
interface ManagerRoleConfig {
  label: string
  description?: string
  project: string
  permissions: Record<string, string[]>
}

interface ClientRoleConfig {
  label: string
  description?: string
  project?: string // Optional - we're adding this
  permissions: Record<string, string[]>
}

interface ProjectConfig {
  collections: string[]
  globals?: string[]
}

interface AccessPluginOptions {
  projects: Record<string, ProjectConfig>
  roles: {
    managers: Record<string, ManagerRoleConfig>
    clients: Record<string, ClientRoleConfig>
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

// Import the config - we need to extract just the config object
// Since payload.config.ts has complex imports, we'll read the file and parse it
async function extractAccessPluginConfig(): Promise<AccessPluginOptions> {
  const configPath = path.join(rootDir, 'src/payload.config.ts')
  const configContent = fs.readFileSync(configPath, 'utf-8')

  // Extract the accessPluginConfig object using regex
  // Find the start of the config
  const configStartMatch = configContent.match(
    /const accessPluginConfig:\s*AccessPluginOptions\s*=\s*{/,
  )
  if (!configStartMatch || configStartMatch.index === undefined) {
    throw new Error('Could not find accessPluginConfig in payload.config.ts')
  }

  const startIndex = configStartMatch.index + configStartMatch[0].length - 1
  let braceCount = 1
  let endIndex = startIndex + 1

  // Find matching closing brace
  while (braceCount > 0 && endIndex < configContent.length) {
    const char = configContent[endIndex]
    if (char === '{') braceCount++
    if (char === '}') braceCount--
    endIndex++
  }

  const configStr = configContent.slice(startIndex, endIndex)

  // Clean up the config string for evaluation
  // Remove bypass function (we don't need it for generation)
  const cleanedConfig = configStr
    // Remove bypass block entirely
    .replace(/bypass:\s*{[\s\S]*?},?\s*(?=}$)/, '')
    // Convert single-quoted strings to double-quoted for JSON
    .replace(/'/g, '"')
    // Remove trailing commas before closing braces/brackets
    .replace(/,(\s*[}\]])/g, '$1')
    // Remove comments
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  try {
    // Use Function constructor to evaluate the object literal
    const evalFn = new Function(`return ${cleanedConfig}`)
    return evalFn() as AccessPluginOptions
  } catch (error) {
    console.error('Failed to parse config:')
    console.error(cleanedConfig)
    throw error
  }
}

function generateAccessFile(config: AccessPluginOptions): string {
  const { projects, roles } = config

  // Generate manager role options
  const managerRoleOptions = Object.entries(roles.managers).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  }))

  // Generate client role options
  const clientRoleOptions = Object.entries(roles.clients).map(([value, cfg]) => ({
    value,
    label: cfg.label,
  }))

  // Generate manager permissions lookup
  const managerPermissions: Record<string, Record<string, string[]>> = {}
  for (const [roleSlug, roleConfig] of Object.entries(roles.managers)) {
    managerPermissions[roleSlug] = roleConfig.permissions
  }

  // Generate client permissions lookup
  const clientPermissions: Record<string, Record<string, string[]>> = {}
  for (const [roleSlug, roleConfig] of Object.entries(roles.clients)) {
    clientPermissions[roleSlug] = roleConfig.permissions
  }

  // Generate project collections lookup
  const projectCollections: Record<string, string[]> = {}
  for (const [projectSlug, projectConfig] of Object.entries(projects)) {
    projectCollections[projectSlug] = [
      ...projectConfig.collections,
      ...(projectConfig.globals || []),
    ]
  }

  // Generate role to project mapping for managers
  const managerRoleProjects: Record<string, string> = {}
  for (const [roleSlug, roleConfig] of Object.entries(roles.managers)) {
    managerRoleProjects[roleSlug] = roleConfig.project
  }

  // Generate role to project mapping for clients
  // For now, we'll derive this from the role slug matching project names
  // or use explicit project field if added to ClientRoleConfig
  const clientRoleProjects: Record<string, string> = {}
  for (const roleSlug of Object.keys(roles.clients)) {
    // Client roles typically match project names
    if (projects[roleSlug]) {
      clientRoleProjects[roleSlug] = roleSlug
    }
  }

  const output = `/**
 * Generated Access Data
 *
 * AUTO-GENERATED FILE - DO NOT EDIT
 * Run: pnpm generate:access
 *
 * This file provides lookup tables for both server and client contexts,
 * generated from accessPluginConfig in payload.config.ts.
 */

import type { PermissionLevel } from '@/lib/access/types'

// ============================================================================
// Role Options (for select fields)
// ============================================================================

/**
 * Manager role options for select fields
 */
export const MANAGER_ROLE_OPTIONS = ${JSON.stringify(managerRoleOptions, null, 2)} as const

/**
 * Client role options for select fields
 */
export const CLIENT_ROLE_OPTIONS = ${JSON.stringify(clientRoleOptions, null, 2)} as const

// ============================================================================
// Permission Lookup Data
// ============================================================================

/**
 * Manager permissions by role and collection
 * Structure: { [roleSlug]: { [collectionSlug]: PermissionLevel[] } }
 */
export const MANAGER_PERMISSIONS: Record<string, Record<string, PermissionLevel[]>> = ${JSON.stringify(managerPermissions, null, 2)}

/**
 * Client permissions by role and collection
 * Structure: { [roleSlug]: { [collectionSlug]: PermissionLevel[] } }
 */
export const CLIENT_PERMISSIONS: Record<string, Record<string, PermissionLevel[]>> = ${JSON.stringify(clientPermissions, null, 2)}

// ============================================================================
// Project Lookup Data
// ============================================================================

/**
 * Collections and globals available in each project
 * Used for project-based implicit read access
 */
export const PROJECT_COLLECTIONS: Record<string, string[]> = ${JSON.stringify(projectCollections, null, 2)}

/**
 * Manager role to project mapping
 * Each role is associated with a project for implicit read access
 */
export const MANAGER_ROLE_PROJECTS: Record<string, string> = ${JSON.stringify(managerRoleProjects, null, 2)}

/**
 * Client role to project mapping
 * Each client role is associated with a project for implicit read access
 */
export const CLIENT_ROLE_PROJECTS: Record<string, string> = ${JSON.stringify(clientRoleProjects, null, 2)}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get permissions for a set of roles
 *
 * Merges permissions from multiple roles into a single object.
 * Used by PermissionsTable component for real-time display.
 *
 * @param roles - Array of role slugs
 * @param type - 'managers' or 'clients'
 * @returns Merged permissions object
 */
export function getPermissionsForRoles(
  roles: string[],
  type: 'managers' | 'clients',
): Record<string, PermissionLevel[]> {
  const lookup = type === 'managers' ? MANAGER_PERMISSIONS : CLIENT_PERMISSIONS
  const merged: Record<string, Set<PermissionLevel>> = {}

  for (const role of roles) {
    const perms = lookup[role]
    if (perms) {
      for (const [collection, ops] of Object.entries(perms)) {
        if (!merged[collection]) {
          merged[collection] = new Set()
        }
        ops.forEach((op) => merged[collection].add(op))
      }
    }
  }

  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, Array.from(v)]),
  )
}

/**
 * Get the project associated with a role
 *
 * @param role - Role slug
 * @param type - 'managers' or 'clients'
 * @returns Project slug or undefined
 */
export function getRoleProject(role: string, type: 'managers' | 'clients'): string | undefined {
  const lookup = type === 'managers' ? MANAGER_ROLE_PROJECTS : CLIENT_ROLE_PROJECTS
  return lookup[role]
}

/**
 * Get collections available in a project
 *
 * @param project - Project slug
 * @returns Array of collection/global slugs
 */
export function getProjectCollections(project: string): string[] {
  return PROJECT_COLLECTIONS[project] || []
}
`

  return output
}

async function main() {
  console.log('Generating access data from accessPluginConfig...')

  try {
    // Extract config from payload.config.ts
    const config = await extractAccessPluginConfig()

    console.log(`Found ${Object.keys(config.roles.managers).length} manager roles`)
    console.log(`Found ${Object.keys(config.roles.clients).length} client roles`)
    console.log(`Found ${Object.keys(config.projects).length} projects`)

    // Generate the output file content
    const output = generateAccessFile(config)

    // Ensure generated directory exists
    const generatedDir = path.join(rootDir, 'src/generated')
    if (!fs.existsSync(generatedDir)) {
      fs.mkdirSync(generatedDir, { recursive: true })
    }

    // Write the file
    const outputPath = path.join(generatedDir, 'access.ts')
    fs.writeFileSync(outputPath, output, 'utf-8')

    console.log(`Generated: ${outputPath}`)
    console.log('Done!')
  } catch (error) {
    console.error('Error generating access data:', error)
    process.exit(1)
  }
}

main()
