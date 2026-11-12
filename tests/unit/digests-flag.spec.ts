import { afterEach, describe, expect, it, vi } from 'vitest'

// The int spec mocks this helper away, and the env spec pins the schema. This
// file joins the two, so a rename on either side cannot leave the pause dead.
const env = {
  NODE_ENV: 'test',
  PAYLOAD_SECRET: 'test-secret-key-with-32-chars-minimum',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/payload_test',
  WEMEDITATE_WEB_URL: 'https://wemeditate.example.com',
  SAHAJATLAS_URL: 'https://atlas.example.com',
} as const

describe('areDigestsEnabled', () => {
  const originalEnv = process.env

  afterEach(() => {
    vi.resetModules()
    process.env = originalEnv
  })

  it('pauses the digests when DIGESTS_ENABLED is unset', async () => {
    process.env = { ...env }
    const { areDigestsEnabled } = await import('../../src/jobs/Digests/featureFlag')

    expect(areDigestsEnabled()).toBe(false)
  })

  it('runs the digests when DIGESTS_ENABLED is true', async () => {
    process.env = { ...env, DIGESTS_ENABLED: 'true' }
    const { areDigestsEnabled } = await import('../../src/jobs/Digests/featureFlag')

    expect(areDigestsEnabled()).toBe(true)
  })
})
