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
import { buildConfig, getPayload, Payload } from 'payload'
import { openapi } from 'payload-oapi'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'
import {
  getProjectCollections,
  getProjectOptions,
  isValidProject,
  getRoleProject,
} from '../../src/lib/access'
import {
  CUSTOM_ENDPOINT_PATHS,
  CUSTOM_ENDPOINT_SCHEMAS,
} from '../../src/lib/openapi/customEndpoints'
import { scalarPlugin } from '../../src/lib/openapi/scalarPlugin'
import {
  filterSpec,
  ALWAYS_HIDDEN_COLLECTIONS,
  CUSTOM_ENDPOINTS_ONLY_COLLECTIONS,
} from '../../src/lib/openapi/specFilter'

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
        protocol: 'http:',
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
      expect(spec.servers).toEqual([{ url: 'http://localhost:3000' }])
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
        protocol: 'http:',
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
        protocol: 'http:',
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
      expect(html).toContain("url: 'http://localhost:3000/api/openapi.json'")
      expect(html).not.toContain('http//localhost')
      // Verify Scalar is loaded
      expect(html.toLowerCase()).toContain('scalar')
      // Verify noindex meta tag (prevents search engine indexing)
      expect(html).toContain('<meta name="robots" content="noindex, nofollow"')
      // Verify X-Robots-Tag header
      expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    })

    it('applies project-specific theme when project is selected', async () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const scalarEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      const mockReq = {
        payload,
        protocol: 'http:',
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
        protocol: 'http:',
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

  describe('CUSTOM_ENDPOINTS_ONLY_COLLECTIONS (#341)', () => {
    const specWithLecturesAndCards = {
      ...mockSpec,
      paths: {
        ...mockSpec.paths,
        '/api/lectures': { get: { summary: 'List lectures' }, post: { summary: 'Create lecture' } },
        '/api/lectures/{id}': { get: { summary: 'Get lecture' } },
        '/api/lectures/for-audience': { get: { summary: 'Lectures for audience' } },
        '/api/app-cards': { get: { summary: 'List app-cards' } },
        '/api/app-cards/{id}': { get: { summary: 'Get app-card' } },
        '/api/app-cards/for-audience': { get: { summary: 'App-cards for audience' } },
      },
    }

    it('marks /api/lectures and /api/lectures/{id} as internal', () => {
      const result = filterSpec(specWithLecturesAndCards)
      expect(result.paths!['/api/lectures']!.get!['x-internal']).toBe(true)
      expect(result.paths!['/api/lectures/{id}']!.get!['x-internal']).toBe(true)
    })

    it('marks /api/app-cards and /api/app-cards/{id} as internal', () => {
      const result = filterSpec(specWithLecturesAndCards)
      expect(result.paths!['/api/app-cards']!.get!['x-internal']).toBe(true)
      expect(result.paths!['/api/app-cards/{id}']!.get!['x-internal']).toBe(true)
    })

    it('leaves /api/lectures/for-audience visible (custom subpath)', () => {
      const result = filterSpec(specWithLecturesAndCards, { project: 'wemeditate-app' })
      expect(result.paths!['/api/lectures/for-audience']!.get!['x-internal']).toBeUndefined()
    })

    it('leaves /api/app-cards/for-audience visible (custom subpath)', () => {
      const result = filterSpec(specWithLecturesAndCards, { project: 'wemeditate-app' })
      expect(result.paths!['/api/app-cards/for-audience']!.get!['x-internal']).toBeUndefined()
    })

    it('includes lectures and app-cards in CUSTOM_ENDPOINTS_ONLY_COLLECTIONS', () => {
      expect(CUSTOM_ENDPOINTS_ONLY_COLLECTIONS).toContain('lectures')
      expect(CUSTOM_ENDPOINTS_ONLY_COLLECTIONS).toContain('app-cards')
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

    it('marks delete and patch internal across every content collection in the spec', () => {
      // Regression guard: it would be easy to add a new collection and
      // forget that DELETE/PATCH must be marked internal for it too.
      const result = filterSpec(mockSpec)

      for (const [routePath, ops] of Object.entries(result.paths!)) {
        if (!routePath.startsWith('/api/')) continue
        if (ops.delete) {
          expect(ops.delete['x-internal'], `${routePath} DELETE should be marked internal`).toBe(
            true,
          )
        }
        if (ops.patch) {
          expect(ops.patch['x-internal'], `${routePath} PATCH should be marked internal`).toBe(true)
        }
      }
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

  describe('Client read parameter injection (#419)', () => {
    it('registers select / populate / depth / limit / page under components.parameters', () => {
      const result = filterSpec(mockSpec)
      const params = result.components?.parameters ?? {}
      expect(params).toHaveProperty('select')
      expect(params).toHaveProperty('populate')
      expect(params).toHaveProperty('depth')
      expect(params).toHaveProperty('limit')
      expect(params).toHaveProperty('page')
    })

    it('attaches all five params to collection list GET (/api/pages)', () => {
      const result = filterSpec(mockSpec)
      const listOp = result.paths!['/api/pages']!.get!
      const refs = (listOp.parameters ?? []).map((p) => p.$ref).filter(Boolean)
      expect(refs).toContain('#/components/parameters/select')
      expect(refs).toContain('#/components/parameters/populate')
      expect(refs).toContain('#/components/parameters/depth')
      expect(refs).toContain('#/components/parameters/limit')
      expect(refs).toContain('#/components/parameters/page')
    })

    it('attaches select/populate/depth (no pagination) to findByID GET (/api/pages/{id})', () => {
      const result = filterSpec(mockSpec)
      const byIdOp = result.paths!['/api/pages/{id}']!.get!
      const refs = (byIdOp.parameters ?? []).map((p) => p.$ref).filter(Boolean)
      expect(refs).toContain('#/components/parameters/select')
      expect(refs).toContain('#/components/parameters/populate')
      expect(refs).toContain('#/components/parameters/depth')
      // Pagination is meaningless on findByID — exclude
      expect(refs).not.toContain('#/components/parameters/limit')
      expect(refs).not.toContain('#/components/parameters/page')
    })

    it('skips operations marked x-internal (e.g. managers)', () => {
      const result = filterSpec(mockSpec)
      const managersOp = result.paths!['/api/managers']!.get!
      const refs = (managersOp.parameters ?? []).map((p) => p.$ref).filter(Boolean)
      expect(refs).not.toContain('#/components/parameters/select')
      expect(refs).not.toContain('#/components/parameters/populate')
    })

    it('skips /api/globals/* paths (different param surface)', () => {
      const result = filterSpec(mockSpec)
      const globalOp = result.paths!['/api/globals/payload-job-stats']!.get!
      const refs = (globalOp.parameters ?? []).map((p) => p.$ref).filter(Boolean)
      expect(refs).not.toContain('#/components/parameters/select')
      expect(refs).not.toContain('#/components/parameters/populate')
    })

    it('skips custom subpath endpoints (e.g. /api/lectures/for-audience)', () => {
      const specWithCustom = {
        ...mockSpec,
        paths: {
          ...mockSpec.paths,
          '/api/lectures/for-audience': {
            get: { summary: 'Audience-targeted lectures' },
          },
        },
      }
      const result = filterSpec(specWithCustom)
      const customOp = result.paths!['/api/lectures/for-audience']!.get!
      const refs = (customOp.parameters ?? []).map((p) => p.$ref).filter(Boolean)
      expect(refs).not.toContain('#/components/parameters/select')
      expect(refs).not.toContain('#/components/parameters/populate')
    })

    it('marks select as required (clients must always specify it)', () => {
      const result = filterSpec(mockSpec)
      const selectParam = result.components?.parameters?.select
      expect(selectParam?.required).toBe(true)
    })

    it('documents deepObject serialization for select and populate', () => {
      const result = filterSpec(mockSpec)
      const selectParam = result.components?.parameters?.select
      const populateParam = result.components?.parameters?.populate

      expect(selectParam?.style).toBe('deepObject')
      expect(selectParam?.explode).toBe(true)
      expect(populateParam?.style).toBe('deepObject')
      expect(populateParam?.explode).toBe(true)
    })

    it('allows populate values to be boolean or nested field-selection objects', () => {
      const result = filterSpec(mockSpec)
      const populateParam = result.components?.parameters?.populate
      const additionalProperties = populateParam?.schema?.additionalProperties as
        | { oneOf?: Array<Record<string, unknown>> }
        | undefined

      expect(additionalProperties?.oneOf).toContainEqual({ type: 'boolean' })
      expect(additionalProperties?.oneOf).toContainEqual({
        type: 'object',
        additionalProperties: true,
      })
    })

    it('allows select values to be boolean or nested field-selection objects', () => {
      const result = filterSpec(mockSpec)
      const selectParam = result.components?.parameters?.select
      const additionalProperties = selectParam?.schema?.additionalProperties as
        | { oneOf?: Array<Record<string, unknown>> }
        | undefined

      expect(additionalProperties?.oneOf).toContainEqual({ type: 'boolean' })
      expect(additionalProperties?.oneOf).toContainEqual({
        type: 'object',
        additionalProperties: true,
      })
    })

    it('documents Payload default depth', () => {
      const result = filterSpec(mockSpec)
      const depthParam = result.components?.parameters?.depth
      expect(depthParam?.schema?.default).toBe(2)
    })
  })

  describe('Path ordering', () => {
    it('returns paths sorted alphabetically', () => {
      const unorderedSpec = {
        ...mockSpec,
        paths: {
          '/api/pages/{id}': { get: { summary: 'Get page' } },
          '/api/meditations': { get: { summary: 'List meditations' } },
          '/api/form-submissions': { post: { summary: 'Submit form' } },
          '/api/pages': { get: { summary: 'List pages' } },
        },
      }
      const result = filterSpec(unorderedSpec)
      const keys = Object.keys(result.paths!)
      expect(keys).toEqual([...keys].sort())
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

      // Pages should be visible (wemeditate-app has pages)
      expect(result.paths!['/api/pages']!.get!['x-internal']).toBeUndefined()

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

    describe('custom endpoint visibility', () => {
      // Build a spec that mirrors the merge the Next.js route handler does.
      const specWithCustomEndpoints = {
        ...mockSpec,
        paths: { ...mockSpec.paths, ...CUSTOM_ENDPOINT_PATHS },
      }

      it('exposes frames + lectures + app-cards custom endpoints to wemeditate-app', () => {
        const result = filterSpec(specWithCustomEndpoints, { project: 'wemeditate-app' })

        expect(
          result.paths!['/api/frames/by-narrator/{narratorId}']!.get!['x-internal'],
        ).toBeUndefined()
        expect(result.paths!['/api/lectures/for-audience']!.get!['x-internal']).toBeUndefined()
        expect(result.paths!['/api/app-cards/for-audience']!.get!['x-internal']).toBeUndefined()
      })

      it('exposes frames + lectures but hides app-cards for wemeditate-web', () => {
        const result = filterSpec(specWithCustomEndpoints, { project: 'wemeditate-web' })

        expect(
          result.paths!['/api/frames/by-narrator/{narratorId}']!.get!['x-internal'],
        ).toBeUndefined()
        expect(result.paths!['/api/lectures/for-audience']!.get!['x-internal']).toBeUndefined()
        // app-cards is not in the wemeditate-web project
        expect(result.paths!['/api/app-cards/for-audience']!.get!['x-internal']).toBe(true)
      })

      it('hides all three custom endpoints from sahaj-atlas', () => {
        const result = filterSpec(specWithCustomEndpoints, { project: 'sahaj-atlas' })

        expect(result.paths!['/api/frames/by-narrator/{narratorId}']!.get!['x-internal']).toBe(true)
        expect(result.paths!['/api/lectures/for-audience']!.get!['x-internal']).toBe(true)
        expect(result.paths!['/api/app-cards/for-audience']!.get!['x-internal']).toBe(true)
      })

      it('exposes all three custom endpoints in the admin / unfiltered view', () => {
        const result = filterSpec(specWithCustomEndpoints)

        expect(
          result.paths!['/api/frames/by-narrator/{narratorId}']!.get!['x-internal'],
        ).toBeUndefined()
        expect(result.paths!['/api/lectures/for-audience']!.get!['x-internal']).toBeUndefined()
        expect(result.paths!['/api/app-cards/for-audience']!.get!['x-internal']).toBeUndefined()
      })
    })
  })
})

describe('Custom Endpoint Shims', () => {
  describe('CUSTOM_ENDPOINT_PATHS', () => {
    it('defines all custom endpoints with GET operations', () => {
      expect(CUSTOM_ENDPOINT_PATHS['/api/frames/by-narrator/{narratorId}']?.get).toBeDefined()
      expect(CUSTOM_ENDPOINT_PATHS['/api/lectures/for-audience']?.get).toBeDefined()
      expect(CUSTOM_ENDPOINT_PATHS['/api/app-cards/for-audience']?.get).toBeDefined()
      expect(CUSTOM_ENDPOINT_PATHS['/api/meditations/{id}/related-lectures']?.get).toBeDefined()
      expect(CUSTOM_ENDPOINT_PATHS['/api/audiences/for-user']?.get).toBeDefined()
    })

    it('frames/by-narrator declares a required narratorId path param and refs the Frames schema', () => {
      const op = CUSTOM_ENDPOINT_PATHS['/api/frames/by-narrator/{narratorId}']!.get!
      const narratorParam = op.parameters?.find((p) => p.name === 'narratorId')
      expect(narratorParam).toBeDefined()
      expect(narratorParam?.in).toBe('path')
      expect(narratorParam?.required).toBe(true)
      expect(narratorParam?.schema?.type).toBe('string')

      const successRef = op.responses?.['200']?.content?.['application/json']?.schema?.$ref
      expect(successRef).toBe('#/components/schemas/Frames')
    })

    it('lectures/for-audience requires a bounded limit (1–100) and refs both player-data schemas via oneOf', () => {
      const op = CUSTOM_ENDPOINT_PATHS['/api/lectures/for-audience']!.get!
      const limitParam = op.parameters?.find((p) => p.name === 'limit')
      expect(limitParam).toBeDefined()
      expect(limitParam?.in).toBe('query')
      expect(limitParam?.required).toBe(true)
      expect(limitParam?.schema?.type).toBe('integer')
      expect(limitParam?.schema?.minimum).toBe(1)
      expect(limitParam?.schema?.maximum).toBe(100)

      const successSchema = op.responses?.['200']?.content?.['application/json']?.schema as
        | { properties?: { docs?: { items?: { $ref?: string } } } }
        | undefined

      const items = successSchema?.properties?.docs?.items
      // After #330: single uniform shape — no oneOf / discriminator.
      expect(items?.$ref).toBe('#/components/schemas/LecturePlayerData')
    })

    it('app-cards/for-audience requires targetSection (hero|highlights) and a bounded limit (1–20)', () => {
      const op = CUSTOM_ENDPOINT_PATHS['/api/app-cards/for-audience']!.get!

      const targetParam = op.parameters?.find((p) => p.name === 'targetSection')
      expect(targetParam).toBeDefined()
      expect(targetParam?.required).toBe(true)
      expect(targetParam?.schema?.enum).toEqual(['hero', 'highlights', 'lectures'])

      const limitParam = op.parameters?.find((p) => p.name === 'limit')
      expect(limitParam?.required).toBe(true)
      expect(limitParam?.schema?.minimum).toBe(1)
      expect(limitParam?.schema?.maximum).toBe(20)

      const successSchema = op.responses?.['200']?.content?.['application/json']?.schema as
        | { properties?: { docs?: { items?: { $ref?: string } } } }
        | undefined
      expect(successSchema?.properties?.docs?.items?.$ref).toBe('#/components/schemas/AppCards')
    })

    it('audience query params on /api/audiences/for-user expose all five required params', () => {
      const allRequiredParams = [
        'pathProgress',
        'meditationsPerWeek',
        'totalMeditationsViewed',
        'totalLecturesViewed',
        'country',
      ]
      const op = CUSTOM_ENDPOINT_PATHS['/api/audiences/for-user']!.get!
      const paramNames = (op.parameters ?? []).map((p) => p.name)

      for (const name of allRequiredParams) {
        expect(paramNames, `/audiences/for-user should expose '${name}'`).toContain(name)
      }
    })

    it('all params on /api/audiences/for-user are required', () => {
      const allRequiredParams = new Set([
        'pathProgress',
        'meditationsPerWeek',
        'totalMeditationsViewed',
        'totalLecturesViewed',
        'country',
      ])
      const op = CUSTOM_ENDPOINT_PATHS['/api/audiences/for-user']!.get!

      for (const param of op.parameters ?? []) {
        if (allRequiredParams.has(param.name)) {
          expect(param.in).toBe('query')
          expect(param.required).toBe(true)
        }
      }
    })

    it('the three data endpoints expose a required `audiences` query param instead', () => {
      // After #340 callers pass a pre-resolved comma-separated list of
      // audience IDs. The schema documents the canonical wire format via a
      // pattern, so OpenAPI codegen / validation tools see the same shape
      // the Zod schema enforces at runtime.
      for (const path of [
        '/api/lectures/for-audience',
        '/api/app-cards/for-audience',
        '/api/meditations/{id}/related-lectures',
      ] as const) {
        const op = CUSTOM_ENDPOINT_PATHS[path]!.get!
        const audiencesParam = (op.parameters ?? []).find((p) => p.name === 'audiences')
        expect(audiencesParam, `${path} should expose 'audiences'`).toBeDefined()
        expect(audiencesParam?.in).toBe('query')
        expect(audiencesParam?.required).toBe(true)
        expect(audiencesParam?.schema?.type).toBe('string')
        expect(audiencesParam?.schema?.pattern).toBe('^\\d+(,\\d+)*$')

        // Old rule-data params must not be present on data endpoints anymore (moved to /for-user).
        const paramNames = (op.parameters ?? []).map((p) => p.name)
        for (const ruleName of [
          'pathProgress',
          'meditationsPerWeek',
          'totalMeditationsViewed',
          'totalLecturesViewed',
        ]) {
          expect(
            paramNames,
            `${path} should NOT expose old rule param '${ruleName}'`,
          ).not.toContain(ruleName)
        }
      }
    })

    it('/api/audiences/for-user returns the AudienceIdList shape', () => {
      const op = CUSTOM_ENDPOINT_PATHS['/api/audiences/for-user']!.get!
      const successRef = op.responses?.['200']?.content?.['application/json']?.schema?.$ref
      expect(successRef).toBe('#/components/schemas/AudienceIdList')

      const listSchema = CUSTOM_ENDPOINT_SCHEMAS.AudienceIdList as
        | {
            type?: string
            required?: string[]
            properties?: { audiences?: { items?: { type?: string } } }
          }
        | undefined
      expect(listSchema?.type).toBe('object')
      expect(listSchema?.required).toContain('audiences')
      expect(listSchema?.properties?.audiences?.items?.type).toBe('integer')
    })

    it('meditations/:id/related-lectures returns LecturePlayerData via single $ref', () => {
      const op = CUSTOM_ENDPOINT_PATHS['/api/meditations/{id}/related-lectures']!.get!
      const successSchema = (
        op.responses?.['200'] as {
          content?: Record<
            string,
            { schema: { properties?: { docs?: { items?: { $ref?: string; oneOf?: unknown } } } } }
          >
        }
      )?.content?.['application/json']?.schema
      const items = successSchema?.properties?.docs?.items
      expect(items?.$ref).toBe('#/components/schemas/LecturePlayerData')
      expect(items?.oneOf).toBeUndefined()
    })

    it('meditations/:id/related-lectures exposes optional userChoice + excludedLectureIds + path id', () => {
      const op = CUSTOM_ENDPOINT_PATHS['/api/meditations/{id}/related-lectures']!.get!
      const params = op.parameters ?? []

      const idParam = params.find((p) => p.name === 'id')
      expect(idParam?.in).toBe('path')
      expect(idParam?.required).toBe(true)

      const userChoiceParam = params.find((p) => p.name === 'userChoice')
      expect(userChoiceParam?.in).toBe('query')
      expect(userChoiceParam?.required).toBe(false)
      expect((userChoiceParam?.schema as { type?: string })?.type).toBe('integer')

      const excludedParam = params.find((p) => p.name === 'excludedLectureIds')
      expect(excludedParam?.in).toBe('query')
      expect(excludedParam?.required).toBe(false)
      expect((excludedParam?.schema as { type?: string })?.type).toBe('string')

      // Limit is required and bounded 1–100, mirroring lectures/for-audience.
      const limitParam = params.find((p) => p.name === 'limit')
      expect(limitParam?.required).toBe(true)
      expect((limitParam?.schema as { maximum?: number; minimum?: number })?.maximum).toBe(100)
      expect((limitParam?.schema as { maximum?: number; minimum?: number })?.minimum).toBe(1)
    })

    it('audience query-param descriptions on /api/audiences/for-user are non-empty', () => {
      // All hand-written params must have a description so Scalar docs are informative.
      const op = CUSTOM_ENDPOINT_PATHS['/api/audiences/for-user']!.get!
      for (const param of op.parameters ?? []) {
        expect(
          param.description,
          `/audiences/for-user '${param.name}' must have a description`,
        ).toBeTruthy()
      }
    })
  })

  describe('CUSTOM_ENDPOINT_SCHEMAS', () => {
    type PlayerSchema = {
      type?: string
      additionalProperties?: boolean
      required?: string[]
      properties?: {
        type?: unknown
        startTime?: { type?: string; enum?: number[] }
        fullLectureId?: { type?: string | string[] }
        lectureId?: unknown
      }
    }

    it('exports a single LecturePlayerData schema (no LectureClipPlayerData / ItemPlayerData)', () => {
      expect(CUSTOM_ENDPOINT_SCHEMAS.LecturePlayerData).toBeDefined()
      // After #330 the lecture / clip distinction is gone — both legacy
      // schema names are removed.
      expect(CUSTOM_ENDPOINT_SCHEMAS.LectureClipPlayerData).toBeUndefined()
      expect(CUSTOM_ENDPOINT_SCHEMAS.ItemPlayerData).toBeUndefined()
    })

    it('LecturePlayerData has no `type` discriminator and exposes nullable fullLectureId', () => {
      const schema = CUSTOM_ENDPOINT_SCHEMAS.LecturePlayerData as PlayerSchema

      expect(schema.type).toBe('object')
      expect(schema.additionalProperties).toBe(false)
      // No discriminator field after the merge.
      expect(schema.properties?.type).toBeUndefined()
      // `lectureId` is the legacy clip-only field; replaced by `fullLectureId`.
      expect(schema.properties?.lectureId).toBeUndefined()
      expect(schema.required ?? []).not.toContain('lectureId')
      expect(schema.required ?? []).toContain('fullLectureId')
      expect(schema.properties?.fullLectureId?.type).toEqual(['integer', 'null'])
    })

    it('defines ErrorResponse with an errors array whose items require a message', () => {
      const schema = CUSTOM_ENDPOINT_SCHEMAS.ErrorResponse as
        | {
            required?: string[]
            properties?: {
              errors?: { type?: string; items?: { required?: string[] } }
            }
          }
        | undefined

      expect(schema).toBeDefined()
      expect(schema?.required).toContain('errors')
      expect(schema?.properties?.errors?.type).toBe('array')
      expect(schema?.properties?.errors?.items?.required).toContain('message')
    })

    it('wires ErrorResponse into 4xx responses on all custom endpoints', () => {
      const pathsWithErrorResponses: Array<[string, string[]]> = [
        ['/api/frames/by-narrator/{narratorId}', ['400', '404']],
        ['/api/lectures/for-audience', ['400']],
        ['/api/app-cards/for-audience', ['400']],
        ['/api/audiences/for-user', ['400']],
      ]

      for (const [path, statusCodes] of pathsWithErrorResponses) {
        const responses = CUSTOM_ENDPOINT_PATHS[path]!.get!.responses!
        for (const code of statusCodes) {
          const ref = (
            responses[code]!.content?.['application/json']?.schema as { $ref?: string } | undefined
          )?.$ref
          expect(ref, `${path} ${code} should reference ErrorResponse`).toBe(
            '#/components/schemas/ErrorResponse',
          )
        }
      }
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

      // Should contain pages
      expect(collections).toContain('pages')
    })

    it('returns correct collections for sahaj-atlas project', () => {
      const collections = getProjectCollections('sahaj-atlas')

      // Sahaj Atlas has minimal permissions (collections + globals)
      expect(collections).toContain('sy-atlas-config')
      expect(collections).toContain('sy-atlas-translations')
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
