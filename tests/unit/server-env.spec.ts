import { afterEach, describe, expect, it, vi } from 'vitest'

// `NODE_ENV` is required on `ProcessEnv` (Next augments it) and is always set
// during a test run, so it is carried through even when clearing the vars under
// test — none of which it is.
const baseEnv = { NODE_ENV: 'test' } as const

const requiredEnv = {
  PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/payload_test',
  WEMEDITATE_WEB_URL: 'https://wemeditate.example.com',
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
    process.env = { ...baseEnv }

    await expect(import('../../src/lib/env/server')).resolves.toBeDefined()
  })

  it('validates when a server variable is accessed', async () => {
    process.env = { ...baseEnv, ...requiredEnv }
    const { serverEnv } = await import('../../src/lib/env/server')

    expect(serverEnv.PAYLOAD_SECRET).toBe(requiredEnv.PAYLOAD_SECRET)
  })

  // The default has to be "run": an existing deployment sets nothing. `FALSE`
  // and a padded value are covered because this flag is an emergency pause,
  // where a typo reading as "run" sends the mail the operator meant to stop.
  it.each([
    [undefined, true],
    ['true', true],
    ['false', false],
    ['0', false],
    ['FALSE', false],
    [' false ', false],
    ['', true],
  ])('parses EVENT_VERIFICATION_ENABLED=%s as %s', async (raw, expected) => {
    process.env = { ...baseEnv, ...requiredEnv }
    if (raw !== undefined) process.env.EVENT_VERIFICATION_ENABLED = raw
    const { serverEnv } = await import('../../src/lib/env/server')

    expect(serverEnv.EVENT_VERIFICATION_ENABLED).toBe(expected)
  })

  it('throws a client-specific error if server variables are accessed in a browser bundle', async () => {
    process.env = { ...baseEnv }
    vi.stubGlobal('window', {})
    const { serverEnv } = await import('../../src/lib/env/server')

    expect(() => serverEnv.PAYLOAD_SECRET).toThrow('serverEnv was accessed in a browser bundle')
  })
})
