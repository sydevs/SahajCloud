import { afterEach, describe, expect, it, vi } from 'vitest'

const requiredEnv = {
  PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
  WEMEDITATE_WEB_URL: 'https://wemeditate.example.com',
  SAHAJCLOUD_PREVIEW_SECRET: 'preview-secret-16plus',
  SAHAJATLAS_URL: 'https://atlas.example.com',
}

describe('serverEnv', () => {
  const originalEnv = process.env

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    process.env = originalEnv
  })

  it('does not validate server variables when the module is imported', async () => {
    process.env = {}

    await expect(import('../../src/lib/env/server')).resolves.toBeDefined()
  })

  it('validates when a server variable is accessed', async () => {
    process.env = { ...requiredEnv }
    const { serverEnv } = await import('../../src/lib/env/server')

    expect(serverEnv.PAYLOAD_SECRET).toBe(requiredEnv.PAYLOAD_SECRET)
  })

  it('throws a client-specific error if server variables are accessed in a browser bundle', async () => {
    process.env = {}
    vi.stubGlobal('window', {})
    const { serverEnv } = await import('../../src/lib/env/server')

    expect(() => serverEnv.PAYLOAD_SECRET).toThrow('serverEnv was accessed in a browser bundle')
  })
})
