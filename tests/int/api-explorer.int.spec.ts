/**
 * Integration tests for API Explorer (OpenAPI/Swagger UI)
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
import { openapi, swaggerUI } from 'payload-oapi'

import { collections, Managers } from '../../src/collections'
import { globals } from '../../src/globals'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('API Explorer', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    // Create a test config that includes the openapi and swaggerUI plugins
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
          metadata: {
            title: 'Sahaj Cloud API',
            version: '1.0.0',
            description: 'REST API for Sahaj Cloud CMS - We Meditate content management',
          },
        }),
        swaggerUI({
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
    it('registers the OpenAPI spec endpoint', () => {
      // Verify the endpoint is registered in the config
      const endpoints = payload.config.endpoints as Endpoint[]
      const openapiEndpoint = endpoints.find(
        (e) => e.path === '/openapi.json' && e.method === 'get',
      )

      expect(openapiEndpoint).toBeDefined()
      expect(openapiEndpoint?.handler).toBeInstanceOf(Function)
    })

    it('generates valid OpenAPI 3.1 spec', async () => {
      // Find the openapi endpoint handler
      const endpoints = payload.config.endpoints as Endpoint[]
      const openapiEndpoint = endpoints.find(
        (e) => e.path === '/openapi.json' && e.method === 'get',
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
        (e) => e.path === '/openapi.json' && e.method === 'get',
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

  describe('Swagger UI', () => {
    it('registers the Swagger UI endpoint', () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const swaggerEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      expect(swaggerEndpoint).toBeDefined()
      expect(swaggerEndpoint?.handler).toBeInstanceOf(Function)
    })

    it('serves Swagger UI HTML', async () => {
      const endpoints = payload.config.endpoints as Endpoint[]
      const swaggerEndpoint = endpoints.find((e) => e.path === '/docs' && e.method === 'get')

      expect(swaggerEndpoint).toBeDefined()

      const mockReq = {
        payload,
        protocol: 'http',
        headers: new Headers({ host: 'localhost:3000' }),
      } as unknown as PayloadRequest

      const response = await swaggerEndpoint!.handler(mockReq)
      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('content-type')).toBe('text/html')

      const html = await response.text()
      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('swagger-ui')
      expect(html).toContain('/api/openapi.json')
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
