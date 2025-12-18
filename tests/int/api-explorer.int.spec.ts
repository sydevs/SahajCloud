/**
 * Integration tests for API Explorer (OpenAPI/Scalar)
 *
 * These are smoke tests to verify the payload-oapi plugin is properly configured
 * and generates documentation endpoints. We trust the plugin works as documented
 * and just verify that endpoints exist and return expected content types.
 */
import type { Endpoint, PayloadRequest } from 'payload'

import path from 'path'
import { fileURLToPath } from 'url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { buildConfig, getPayload, Payload } from 'payload'
import { openapi, scalar } from 'payload-oapi'

import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'
import {
  markInternalPaths,
  DEFAULT_MARKER_CONFIG,
} from '../../src/lib/openapi/markInternalPaths'

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
        scalar({
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
      expect(spec.paths['/api/music']).toBeDefined()
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

    it('serves Scalar UI HTML', async () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const scalarEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      expect(scalarEndpoint).toBeDefined()

      const mockReq = {
        payload,
        protocol: 'http',
        headers: new Headers({ host: 'localhost:3000' }),
      } as unknown as PayloadRequest

      const response = await scalarEndpoint!.handler(mockReq)
      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('content-type')).toBe('text/html')

      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      // Scalar UI includes these identifiers
      expect(html.toLowerCase()).toContain('scalar')
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
      '/api/image-tags': {
        get: { summary: 'List image tags' },
        post: { summary: 'Create image tag' },
      },
      // Global paths use /api/globals/{slug} format
      '/api/globals/payload-job-stats': {
        get: { summary: 'Get job stats' },
      },
    },
  }

  it('marks excluded collections as internal', () => {
    const result = markInternalPaths(mockSpec, DEFAULT_MARKER_CONFIG)

    // Access collections should be marked internal
    expect(result.paths!['/api/managers']!.get!['x-internal']).toBe(true)
    expect(result.paths!['/api/managers']!.post!['x-internal']).toBe(true)

    // System collections should be marked internal
    expect(result.paths!['/api/images']!.get!['x-internal']).toBe(true)
    expect(result.paths!['/api/images']!.post!['x-internal']).toBe(true)
    expect(result.paths!['/api/files']!.get!['x-internal']).toBe(true)
    expect(result.paths!['/api/files']!.post!['x-internal']).toBe(true)
    expect(result.paths!['/api/image-tags']!.get!['x-internal']).toBe(true)
    expect(result.paths!['/api/image-tags']!.post!['x-internal']).toBe(true)

    // Payload internal collections should be marked internal
    expect(result.paths!['/api/payload-jobs']!.get!['x-internal']).toBe(true)

    // Payload globals should be marked internal (uses /api/globals/{slug} path)
    expect(result.paths!['/api/globals/payload-job-stats']!.get!['x-internal']).toBe(true)
  })

  it('marks delete and patch operations as internal', () => {
    const result = markInternalPaths(mockSpec, DEFAULT_MARKER_CONFIG)

    // Delete operations should be marked internal
    expect(result.paths!['/api/pages']!.delete!['x-internal']).toBe(true)
    expect(result.paths!['/api/pages/{id}']!.delete!['x-internal']).toBe(true)

    // Patch operations should be marked internal
    expect(result.paths!['/api/pages/{id}']!.patch!['x-internal']).toBe(true)
  })

  it('marks POST operations as internal except for allowed collections', () => {
    const result = markInternalPaths(mockSpec, DEFAULT_MARKER_CONFIG)

    // Pages POST should be marked internal
    expect(result.paths!['/api/pages']!.post!['x-internal']).toBe(true)

    // Form-submissions POST should NOT be marked internal
    expect(result.paths!['/api/form-submissions']!.post!['x-internal']).toBeUndefined()
  })

  it('does not mark GET operations for non-excluded collections', () => {
    const result = markInternalPaths(mockSpec, DEFAULT_MARKER_CONFIG)

    // Pages GET should NOT be marked internal
    expect(result.paths!['/api/pages']!.get!['x-internal']).toBeUndefined()
    expect(result.paths!['/api/pages/{id}']!.get!['x-internal']).toBeUndefined()

    // Form-submissions GET should NOT be marked internal
    expect(result.paths!['/api/form-submissions']!.get!['x-internal']).toBeUndefined()
  })

  it('does not mutate the original spec', () => {
    const originalSpec = JSON.parse(JSON.stringify(mockSpec))
    markInternalPaths(mockSpec, DEFAULT_MARKER_CONFIG)

    expect(mockSpec).toEqual(originalSpec)
  })

  it('handles specs without paths gracefully', () => {
    const emptySpec = { openapi: '3.1.0', info: { title: 'Test', version: '1.0.0' } }
    const result = markInternalPaths(emptySpec, DEFAULT_MARKER_CONFIG)

    expect(result).toEqual(emptySpec)
  })
})
