/**
 * Integration tests for API Explorer (OpenAPI/Scalar)
 *
 * These tests verify:
 * 1. The payload-oapi plugin generates valid OpenAPI specs
 * 2. The custom Scalar plugin serves documentation
 * 3. The filterSpec utility correctly filters specs
 * 4. Project-based filtering works correctly for each project
 */
import type { Endpoint, PayloadRequest } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { buildConfig, getPayload, Payload } from 'payload'
import { openapi } from 'payload-oapi'

import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'
import {
  filterSpec,
  ALWAYS_HIDDEN_COLLECTIONS,
  EXCLUDED_OPERATIONS,
  ALLOW_POST_FOR,
} from '../../src/lib/openapi/specFilter'
import {
  getProjectCollections,
  getProjectOptions,
  isValidProject,
  getRoleProject,
} from '../../src/lib/access'
import { scalarPlugin } from '../../src/lib/openapi/scalarPlugin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('API Explorer', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    // Create a test config that includes the openapi and scalar plugins
    const config = buildConfig({
      admin: {
        user: Managers.slug,
        disable: true,
      },
      collections,
      globals,
      editor: lexicalEditor(),
      secret: process.env.PAYLOAD_SECRET || 'test-secret-key',
      typescript: {
        outputFile: path.resolve(__dirname, '../../src/payload-types.ts'),
      },
      db: sqliteAdapter({
        client: {
          url: ':memory:',
        },
        push: true,
      }),
      plugins: [
        openapi({
          openapiVersion: '3.1',
          specEndpoint: '/openapi-raw.json', // Raw spec endpoint
          metadata: {
            title: 'Sahaj Cloud API',
            version: '1.0.0',
            description: 'REST API for Sahaj Cloud CMS - We Meditate content management',
          },
        }),
        scalarPlugin({
          specEndpoint: '/openapi.json', // Points to filtered spec (in production)
          docsUrl: '/docs',
        }),
      ],
    })

    payload = await getPayload({ config })

    cleanup = async () => {
      try {
        if (payload.db && typeof payload.db.destroy === 'function') {
          await payload.db.destroy()
        }
      } catch (_error) {
        // Cleanup error - not critical for in-memory DB
      }
    }
  }, 30000)

  afterAll(async () => {
    await cleanup()
  })

  describe('OpenAPI Specification', () => {
    it('registers the raw OpenAPI spec endpoint', () => {
      // Verify the endpoint is registered in the config
      const endpoints = payload.config.endpoints as Endpoint[]
      const openapiEndpoint = endpoints.find(
        (e) => e.path === '/openapi-raw.json' && e.method === 'get',
      )

      expect(openapiEndpoint).toBeDefined()
      expect(openapiEndpoint?.handler).toBeInstanceOf(Function)
    })

    it('generates valid OpenAPI 3.1 spec', async () => {
      // Find the openapi endpoint handler
      const endpoints = payload.config.endpoints as Endpoint[]
      const openapiEndpoint = endpoints.find(
        (e) => e.path === '/openapi-raw.json' && e.method === 'get',
      )

      expect(openapiEndpoint).toBeDefined()

      // Create a mock request
      const mockReq = {
        payload,
        protocol: 'http',
        headers: new Headers({ host: 'localhost:3000' }),
      } as unknown as PayloadRequest

      // Call the handler directly
      const response = await openapiEndpoint!.handler(mockReq)
      expect(response).toBeInstanceOf(Response)

      const spec = await response.json()

      // Verify it's a valid OpenAPI 3.1 spec
      expect(spec.openapi).toBe('3.1.0')
      expect(spec.info).toBeDefined()
      expect(spec.info.title).toBe('Sahaj Cloud API')
      expect(spec.info.version).toBe('1.0.0')
      expect(spec.paths).toBeDefined()
      expect(spec.components).toBeDefined()
    })

    it('includes collection endpoints in the spec', async () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const openapiEndpoint = endpoints.find(
        (e) => e.path === '/openapi-raw.json' && e.method === 'get',
      )

      const mockReq = {
        payload,
        protocol: 'http',
        headers: new Headers({ host: 'localhost:3000' }),
      } as unknown as PayloadRequest

      const response = await openapiEndpoint!.handler(mockReq)
      const spec = await response.json()

      // Verify some key collection paths exist
      expect(spec.paths['/api/pages']).toBeDefined()
      expect(spec.paths['/api/meditations']).toBeDefined()
      expect(spec.paths['/api/songs']).toBeDefined()
      expect(spec.paths['/api/managers']).toBeDefined()
    })
  })

  describe('Scalar UI', () => {
    it('registers the Scalar UI endpoint', () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const scalarEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      expect(scalarEndpoint).toBeDefined()
      expect(scalarEndpoint?.handler).toBeInstanceOf(Function)
    })

    it('serves Scalar UI HTML with We Meditate branding', async () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const scalarEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      expect(scalarEndpoint).toBeDefined()

      const mockReq = {
        payload,
        protocol: 'http',
        headers: new Headers({ host: 'localhost:3000' }),
        url: 'http://localhost:3000/api/docs',
      } as unknown as PayloadRequest

      const response = await scalarEndpoint!.handler(mockReq)
      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('content-type')).toBe('text/html')

      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      // Verify default branding (no project selected)
      expect(html).toContain('Sahaj Cloud API Documentation')
      expect(html).toContain('sahaj-cloud.svg') // Default logo
      // Default theme uses Scalar's built-in theme (no custom colors)
      expect(html).not.toContain('#F07855') // No coral when no project selected
      // Verify project selector
      expect(html).toContain('project-select')
      expect(html).toContain('All Endpoints')
      // Verify Scalar is loaded
      expect(html.toLowerCase()).toContain('scalar')
    })

    it('applies project-specific theme when project is selected', async () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const scalarEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      const mockReq = {
        payload,
        protocol: 'http',
        headers: new Headers({ host: 'localhost:3000' }),
        url: 'http://localhost:3000/api/docs?project=wemeditate-web',
      } as unknown as PayloadRequest

      const response = await scalarEndpoint!.handler(mockReq)
      const html = await response.text()

      // Verify We Meditate Web branding
      expect(html).toContain('WeMeditate Web API Documentation')
      expect(html).toContain('wemeditate-web.svg') // Project-specific logo
      expect(html).toContain('#F07855') // Coral theme color
    })

    it('includes project selector with all projects', async () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const scalarEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      const mockReq = {
        payload,
        protocol: 'http',
        headers: new Headers({ host: 'localhost:3000' }),
        url: 'http://localhost:3000/api/docs',
      } as unknown as PayloadRequest

      const response = await scalarEndpoint!.handler(mockReq)
      const html = await response.text()

      // Verify all projects are in the selector
      expect(html).toContain('WeMeditate Web')
      expect(html).toContain('WeMeditate App')
      expect(html).toContain('Sahaj Atlas')
    })
  })

  describe('OAuth2 Authentication Endpoint', () => {
    it('registers the authentication endpoint', () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const authEndpoint = endpoints.find((e) => e.path === '/openapi-auth' && e.method === 'post')

      expect(authEndpoint).toBeDefined()
      expect(authEndpoint?.handler).toBeInstanceOf(Function)
    })
  })
})

describe('OpenAPI Spec Marker Utility', () => {
  const mockSpec = {
    openapi: '3.1.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/api/pages': {
        get: { summary: 'List pages' },
        post: { summary: 'Create page' },
        delete: { summary: 'Delete pages' },
      },
      '/api/pages/{id}': {
        get: { summary: 'Get page' },
        patch: { summary: 'Update page' },
        delete: { summary: 'Delete page' },
      },
      '/api/managers': {
        get: { summary: 'List managers' },
        post: { summary: 'Create manager' },
      },
      '/api/form-submissions': {
        get: { summary: 'List submissions' },
        post: { summary: 'Create submission' },
      },
      '/api/payload-jobs': {
        get: { summary: 'List jobs' },
      },
      '/api/images': {
        get: { summary: 'List images' },
        post: { summary: 'Upload image' },
      },
      '/api/files': {
        get: { summary: 'List files' },
        post: { summary: 'Upload file' },
      },
      '/api/meditations': {
        get: { summary: 'List meditations' },
        post: { summary: 'Create meditation' },
      },
      '/api/songs': {
        get: { summary: 'List songs' },
        post: { summary: 'Create song' },
      },
      '/api/albums': {
        get: { summary: 'List albums' },
        post: { summary: 'Create album' },
      },
      '/api/lessons': {
        get: { summary: 'List lessons' },
        post: { summary: 'Create lesson' },
      },
      // Global paths use /api/globals/{slug} format
      '/api/globals/payload-job-stats': {
        get: { summary: 'Get job stats' },
      },
    },
  }

  describe('ALWAYS_HIDDEN_COLLECTIONS', () => {
    it('marks excluded collections as internal', () => {
      const result = filterSpec(mockSpec)

      // Access collections should be marked internal
      expect(result.paths!['/api/managers']!.get!['x-internal']).toBe(true)
      expect(result.paths!['/api/managers']!.post!['x-internal']).toBe(true)

      // System collections should be marked internal
      expect(result.paths!['/api/images']!.get!['x-internal']).toBe(true)
      expect(result.paths!['/api/images']!.post!['x-internal']).toBe(true)
      expect(result.paths!['/api/files']!.get!['x-internal']).toBe(true)
      expect(result.paths!['/api/files']!.post!['x-internal']).toBe(true)

      // Payload internal collections should be marked internal
      expect(result.paths!['/api/payload-jobs']!.get!['x-internal']).toBe(true)

      // Payload globals should be marked internal (uses /api/globals/{slug} path)
      expect(result.paths!['/api/globals/payload-job-stats']!.get!['x-internal']).toBe(true)
    })

    it('includes all expected system collections', () => {
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('managers')
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('clients')
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('images')
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('files')
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('payload-jobs')
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('payload-locked-documents')
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('payload-preferences')
      expect(ALWAYS_HIDDEN_COLLECTIONS).toContain('payload-migrations')
    })
  })

  describe('Operation filtering', () => {
    it('marks delete and patch operations as internal', () => {
      const result = filterSpec(mockSpec)

      // Delete operations should be marked internal
      expect(result.paths!['/api/pages']!.delete!['x-internal']).toBe(true)
      expect(result.paths!['/api/pages/{id}']!.delete!['x-internal']).toBe(true)

      // Patch operations should be marked internal
      expect(result.paths!['/api/pages/{id}']!.patch!['x-internal']).toBe(true)
    })

    it('marks POST operations as internal except for allowed collections', () => {
      const result = filterSpec(mockSpec)

      // Pages POST should be marked internal
      expect(result.paths!['/api/pages']!.post!['x-internal']).toBe(true)

      // Form-submissions POST should NOT be marked internal
      expect(result.paths!['/api/form-submissions']!.post!['x-internal']).toBeUndefined()
    })

    it('does not mark GET operations for non-excluded collections', () => {
      const result = filterSpec(mockSpec)

      // Pages GET should NOT be marked internal
      expect(result.paths!['/api/pages']!.get!['x-internal']).toBeUndefined()
      expect(result.paths!['/api/pages/{id}']!.get!['x-internal']).toBeUndefined()

      // Form-submissions GET should NOT be marked internal
      expect(result.paths!['/api/form-submissions']!.get!['x-internal']).toBeUndefined()
    })
  })

  describe('Spec immutability', () => {
    it('does not mutate the original spec', () => {
      const originalSpec = JSON.parse(JSON.stringify(mockSpec))
      filterSpec(mockSpec)

      expect(mockSpec).toEqual(originalSpec)
    })

    it('handles specs without paths gracefully', () => {
      const emptySpec = { openapi: '3.1.0', info: { title: 'Test', version: '1.0.0' } }
      const result = filterSpec(emptySpec)

      expect(result).toEqual(emptySpec)
    })
  })

  describe('Project-based filtering', () => {
    it('filters to wemeditate-web collections when project is specified', () => {
      const result = filterSpec(mockSpec, { project: 'wemeditate-web' })

      // Pages should be visible (wemeditate-web has pages permission)
      expect(result.paths!['/api/pages']!.get!['x-internal']).toBeUndefined()

      // Meditations should be visible (wemeditate-web has meditations permission)
      expect(result.paths!['/api/meditations']!.get!['x-internal']).toBeUndefined()

      // Albums should be visible (wemeditate-web has albums permission)
      expect(result.paths!['/api/albums']!.get!['x-internal']).toBeUndefined()

      // Lessons should be hidden (wemeditate-web does NOT have lessons permission)
      expect(result.paths!['/api/lessons']!.get!['x-internal']).toBe(true)
    })

    it('filters to wemeditate-app collections when project is specified', () => {
      const result = filterSpec(mockSpec, { project: 'wemeditate-app' })

      // Meditations should be visible
      expect(result.paths!['/api/meditations']!.get!['x-internal']).toBeUndefined()

      // Lessons should be visible (wemeditate-app has lessons permission)
      expect(result.paths!['/api/lessons']!.get!['x-internal']).toBeUndefined()

      // Pages should be hidden (wemeditate-app does NOT have pages permission)
      expect(result.paths!['/api/pages']!.get!['x-internal']).toBe(true)

      // Albums should be visible (wemeditate-app HAS albums permission)
      expect(result.paths!['/api/albums']!.get!['x-internal']).toBeUndefined()
    })

    it('filters to sahaj-atlas collections when project is specified', () => {
      const result = filterSpec(mockSpec, { project: 'sahaj-atlas' })

      // Most collections should be hidden for sahaj-atlas (minimal permissions)
      expect(result.paths!['/api/pages']!.get!['x-internal']).toBe(true)
      expect(result.paths!['/api/meditations']!.get!['x-internal']).toBe(true)
      expect(result.paths!['/api/songs']!.get!['x-internal']).toBe(true)
    })

    it('shows union of all project collections when no project specified', () => {
      const result = filterSpec(mockSpec)

      // Pages should be visible (in wemeditate-web)
      expect(result.paths!['/api/pages']!.get!['x-internal']).toBeUndefined()

      // Meditations should be visible (in multiple projects)
      expect(result.paths!['/api/meditations']!.get!['x-internal']).toBeUndefined()

      // Lessons should be visible (in wemeditate-app)
      expect(result.paths!['/api/lessons']!.get!['x-internal']).toBeUndefined()

      // System collections should still be hidden
      expect(result.paths!['/api/images']!.get!['x-internal']).toBe(true)
    })
  })
})

describe('Project Filtering Utilities', () => {
  describe('getProjectCollections', () => {
    it('returns correct collections for wemeditate-web project', () => {
      const collections = getProjectCollections('wemeditate-web')

      expect(collections).toContain('pages')
      expect(collections).toContain('meditations')
      expect(collections).toContain('songs')
      expect(collections).toContain('albums')
      expect(collections).toContain('forms')
      expect(collections).toContain('authors')
      expect(collections).toContain('form-submissions')

      // Should NOT contain lessons (app-only)
      expect(collections).not.toContain('lessons')
    })

    it('returns correct collections for wemeditate-app project', () => {
      const collections = getProjectCollections('wemeditate-app')

      expect(collections).toContain('meditations')
      expect(collections).toContain('lessons')
      expect(collections).toContain('lectures')
      expect(collections).toContain('songs')
      expect(collections).toContain('albums')

      // Should NOT contain pages
      expect(collections).not.toContain('pages')
    })

    it('returns correct collections for sahaj-atlas project', () => {
      const collections = getProjectCollections('sahaj-atlas')

      // Sahaj Atlas has minimal permissions
      expect(collections).toContain('sahaj-atlas-settings')
      expect(collections).toContain('images')
      expect(collections).toContain('files')

      // Should NOT contain content collections
      expect(collections).not.toContain('meditations')
      expect(collections).not.toContain('pages')
    })
  })

  describe('Project collections union', () => {
    it('returns union of all project collections', () => {
      const allCollections = Array.from(
        new Set(
          getProjectOptions()
            .map((opt) => getProjectCollections(opt.value))
            .flat(),
        ),
      )

      // Should include collections from all projects
      expect(allCollections).toContain('pages') // wemeditate-web
      expect(allCollections).toContain('lessons') // wemeditate-app
      expect(allCollections).toContain('meditations') // both
      expect(allCollections).toContain('albums') // wemeditate-web
    })

    it('does not include duplicates', () => {
      const allCollections = Array.from(
        new Set(
          getProjectOptions()
            .map((opt) => getProjectCollections(opt.value))
            .flat(),
        ),
      )
      const uniqueCollections = [...new Set(allCollections)]

      expect(allCollections.length).toBe(uniqueCollections.length)
    })
  })

  describe('isValidProject', () => {
    it('returns true for valid projects', () => {
      expect(isValidProject('wemeditate-web')).toBe(true)
      expect(isValidProject('wemeditate-app')).toBe(true)
      expect(isValidProject('sahaj-atlas')).toBe(true)
    })

    it('returns false for invalid projects', () => {
      expect(isValidProject('invalid-project')).toBe(false)
      expect(isValidProject('')).toBe(false)
      expect(isValidProject('admin')).toBe(false)
    })
  })
})

describe('albums collection is accessible to client roles', () => {
  it('wemeditate-web project includes albums collection', () => {
    const project = getRoleProject('wemeditate-web-client')!
    const projectCollections = getProjectCollections(project)
    expect(projectCollections).toContain('albums')
  })

  it('wemeditate-app project includes albums collection', () => {
    const project = getRoleProject('wemeditate-app-client')!
    const projectCollections = getProjectCollections(project)
    expect(projectCollections).toContain('albums')
  })
})
