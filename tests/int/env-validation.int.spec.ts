/**
 * Integration tests for environment variable validation
 *
 * Tests the Zod-based validation in src/lib/env.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { z } from 'zod'

// Note: We can't directly test the exported serverEnv/clientEnv since they're immediately
// evaluated at module load. Instead, we'll test the validation logic by reconstructing
// the schemas and validation patterns.

describe('Environment Variable Validation', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original process.env
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    // Restore original process.env
    process.env = originalEnv
  })

  describe('PAYLOAD_SECRET validation', () => {
    it('accepts valid 32+ character secret', () => {
      const schema = z.object({
        PAYLOAD_SECRET: z.string().min(32),
      })

      expect(() =>
        schema.parse({
          PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
        }),
      ).not.toThrow()
    })

    it('rejects secret shorter than 32 characters', () => {
      const schema = z.object({
        PAYLOAD_SECRET: z.string().min(32),
      })

      expect(() =>
        schema.parse({
          PAYLOAD_SECRET: 'short-secret',
        }),
      ).toThrow(/Too small|at least 32/)
    })

    it('rejects missing secret', () => {
      const schema = z.object({
        PAYLOAD_SECRET: z.string().min(32),
      })

      expect(() => schema.parse({})).toThrow()
    })
  })

  describe('API key validation', () => {
    const API_KEY_MIN_LENGTH = 20

    it('accepts valid API key with 20+ characters', () => {
      const schema = z.object({
        CLOUDFLARE_API_KEY: z.string().min(API_KEY_MIN_LENGTH).optional(),
      })

      expect(() =>
        schema.parse({
          CLOUDFLARE_API_KEY: 'valid-api-key-with-sufficient-length',
        }),
      ).not.toThrow()
    })

    it('rejects API key shorter than 20 characters', () => {
      const schema = z.object({
        CLOUDFLARE_API_KEY: z.string().min(API_KEY_MIN_LENGTH).optional(),
      })

      expect(() =>
        schema.parse({
          CLOUDFLARE_API_KEY: 'short-key',
        }),
      ).toThrow()
    })

    it('allows optional API key to be missing', () => {
      const schema = z.object({
        CLOUDFLARE_API_KEY: z.string().min(API_KEY_MIN_LENGTH).optional(),
      })

      expect(() => schema.parse({})).not.toThrow()
    })
  })

  describe('URL validation', () => {
    it('accepts valid HTTPS URLs', () => {
      const schema = z.object({
        CLOUDFLARE_IMAGES_DELIVERY_URL: z.url().optional(),
      })

      expect(() =>
        schema.parse({
          CLOUDFLARE_IMAGES_DELIVERY_URL: 'https://imagedelivery.net/abc123',
        }),
      ).not.toThrow()
    })

    it('accepts valid HTTP URLs (for localhost)', () => {
      const schema = z.object({
        SAHAJCLOUD_URL: z.url().optional(),
      })

      expect(() =>
        schema.parse({
          SAHAJCLOUD_URL: 'http://localhost:3000',
        }),
      ).not.toThrow()
    })

    it('rejects invalid URL format', () => {
      const schema = z.object({
        CLOUDFLARE_IMAGES_DELIVERY_URL: z.url().optional(),
      })

      expect(() =>
        schema.parse({
          CLOUDFLARE_IMAGES_DELIVERY_URL: 'not-a-valid-url',
        }),
      ).toThrow(/Invalid URL|Invalid url/)
    })
  })

  describe('Enum validation', () => {
    it('accepts valid log level', () => {
      const schema = z.object({
        NEXT_PUBLIC_LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).optional(),
      })

      expect(() =>
        schema.parse({
          NEXT_PUBLIC_LOG_LEVEL: 'info',
        }),
      ).not.toThrow()
    })

    it('rejects invalid log level', () => {
      const schema = z.object({
        NEXT_PUBLIC_LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).optional(),
      })

      expect(() =>
        schema.parse({
          NEXT_PUBLIC_LOG_LEVEL: 'invalid-level',
        }),
      ).toThrow()
    })

    it('accepts valid NODE_ENV', () => {
      const schema = z.object({
        NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
      })

      expect(() =>
        schema.parse({
          NODE_ENV: 'development',
        }),
      ).not.toThrow()
    })
  })

  describe('Email validation', () => {
    it('accepts valid email format', () => {
      const schema = z.object({
        ADMIN_EMAIL: z.email().optional(),
      })

      expect(() =>
        schema.parse({
          ADMIN_EMAIL: 'admin@example.com',
        }),
      ).not.toThrow()
    })

    it('rejects invalid email format', () => {
      const schema = z.object({
        ADMIN_EMAIL: z.email().optional(),
      })

      expect(() =>
        schema.parse({
          ADMIN_EMAIL: 'not-an-email',
        }),
      ).toThrow(/Invalid email/)
    })
  })

  describe('Default values', () => {
    const DEFAULT_WEMEDITATE_WEB_URL = 'http://localhost:5173'
    const DEFAULT_SAHAJATLAS_URL = 'http://localhost:5174'
    const DEFAULT_PORT = 3000

    it('applies default value for WEMEDITATE_WEB_URL', () => {
      const schema = z.object({
        WEMEDITATE_WEB_URL: z.url().optional().default(DEFAULT_WEMEDITATE_WEB_URL),
      })

      const result = schema.parse({})
      expect(result.WEMEDITATE_WEB_URL).toBe(DEFAULT_WEMEDITATE_WEB_URL)
    })

    it('applies default value for SAHAJATLAS_URL', () => {
      const schema = z.object({
        SAHAJATLAS_URL: z.url().optional().default(DEFAULT_SAHAJATLAS_URL),
      })

      const result = schema.parse({})
      expect(result.SAHAJATLAS_URL).toBe(DEFAULT_SAHAJATLAS_URL)
    })

    it('applies default value for PORT', () => {
      const schema = z.object({
        PORT: z.coerce.number().int().min(1).max(65535).optional().default(DEFAULT_PORT),
      })

      const result = schema.parse({})
      expect(result.PORT).toBe(DEFAULT_PORT)
    })

    it('allows overriding default values', () => {
      const schema = z.object({
        WEMEDITATE_WEB_URL: z.url().optional().default(DEFAULT_WEMEDITATE_WEB_URL),
      })

      const result = schema.parse({
        WEMEDITATE_WEB_URL: 'http://localhost:9999',
      })
      expect(result.WEMEDITATE_WEB_URL).toBe('http://localhost:9999')
    })
  })

  describe('Port validation', () => {
    it('accepts valid port number', () => {
      const schema = z.object({
        PORT: z.coerce.number().int().min(1).max(65535).optional(),
      })

      expect(() =>
        schema.parse({
          PORT: '3000',
        }),
      ).not.toThrow()
    })

    it('coerces string to number', () => {
      const schema = z.object({
        PORT: z.coerce.number().int().min(1).max(65535).optional(),
      })

      const result = schema.parse({
        PORT: '3000',
      })
      expect(result.PORT).toBe(3000)
      expect(typeof result.PORT).toBe('number')
    })

    it('rejects port number below 1', () => {
      const schema = z.object({
        PORT: z.coerce.number().int().min(1).max(65535).optional(),
      })

      expect(() =>
        schema.parse({
          PORT: '0',
        }),
      ).toThrow()
    })

    it('rejects port number above 65535', () => {
      const schema = z.object({
        PORT: z.coerce.number().int().min(1).max(65535).optional(),
      })

      expect(() =>
        schema.parse({
          PORT: '70000',
        }),
      ).toThrow()
    })
  })

  describe('Password validation', () => {
    const ADMIN_PASSWORD_MIN_LENGTH = 8

    it('accepts valid password with 8+ characters', () => {
      const schema = z.object({
        ADMIN_PASSWORD: z.string().min(ADMIN_PASSWORD_MIN_LENGTH).optional(),
      })

      expect(() =>
        schema.parse({
          ADMIN_PASSWORD: 'validpass123',
        }),
      ).not.toThrow()
    })

    it('rejects password shorter than 8 characters', () => {
      const schema = z.object({
        ADMIN_PASSWORD: z.string().min(ADMIN_PASSWORD_MIN_LENGTH).optional(),
      })

      expect(() =>
        schema.parse({
          ADMIN_PASSWORD: 'short',
        }),
      ).toThrow()
    })
  })

  describe('requireBinding helper', () => {
    // We'll import and test the actual requireBinding function
    it('returns binding when present', async () => {
      // Dynamic import to avoid module-level evaluation issues
      const { requireBinding } = await import('@/lib/env')

      const mockBinding = { someProperty: 'value' }
      expect(requireBinding(mockBinding, 'TestBinding')).toBe(mockBinding)
    })

    it('throws error when binding is undefined', async () => {
      const { requireBinding } = await import('@/lib/env')

      expect(() => requireBinding(undefined, 'TestBinding')).toThrow(/Required Cloudflare binding/)
      expect(() => requireBinding(undefined, 'TestBinding')).toThrow(/TestBinding/)
    })

    it('throws error when binding is null', async () => {
      const { requireBinding } = await import('@/lib/env')

      expect(() => requireBinding(null, 'TestBinding')).toThrow(/Required Cloudflare binding/)
    })

    it('includes binding name in error message', async () => {
      const { requireBinding } = await import('@/lib/env')

      expect(() => requireBinding(undefined, 'R2')).toThrow(/R2/)
      expect(() => requireBinding(undefined, 'R2')).toThrow(/wrangler.toml/)
    })
  })

  describe('Shared public fields', () => {
    it('includes same fields in both server and client schemas', () => {
      const sharedFields = {
        NEXT_PUBLIC_LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).optional(),
        NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
      }

      const serverSchema = z.object({
        PAYLOAD_SECRET: z.string().min(32),
        ...sharedFields,
      })

      const clientSchema = z.object(sharedFields)

      // Both should validate same public fields
      const testEnv = {
        NEXT_PUBLIC_LOG_LEVEL: 'info',
        NEXT_PUBLIC_SENTRY_DSN: 'https://sentry.io/test',
      }

      expect(() => serverSchema.parse({ PAYLOAD_SECRET: 'a'.repeat(32), ...testEnv })).not.toThrow()
      expect(() => clientSchema.parse(testEnv)).not.toThrow()
    })
  })
})
