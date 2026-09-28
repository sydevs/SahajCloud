/**
 * The preview-only session exchange (#840).
 *
 * `disableLocalStrategy` closes `POST /api/managers/login`, and the smoke lane
 * used to be its only non-human caller. What replaces it trades
 * `PREVIEW_ADMIN_PASSWORD` for a session — the secret a Railway preview already
 * holds, so no new CI secret exists to leak.
 *
 * ⚠ **The gate is the WIRING, not a branch inside the handler.** A route that
 * existed everywhere and refused everywhere would be one env-var typo away from
 * a password login on production. So the property under test is that
 * `loginPlugin` builds no such endpoint unless this boot is a preview holding
 * the secret — which is why these cases re-import the plugin under a changed
 * environment rather than calling a predicate.
 */
import type { CollectionConfig, Config, Endpoint, Plugin } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LoginCollectionConfig } from '@/plugins/login'
import { EXCHANGE_PREVIEW_SECRET_PATH } from '@/plugins/login/endpoints/exchangePreviewSecret'

const managers: LoginCollectionConfig = {
  slug: 'managers',
  requestPagePath: '/managers/signin',
}

/**
 * ⚠ **The real constant, not a copy.** Three of the five cases assert the path
 * is ABSENT, and a stale literal here would satisfy all three forever.
 */
const EXCHANGE_PATH = EXCHANGE_PREVIEW_SECRET_PATH

const originalEnv = process.env

/** Fold the plugin freshly, so the module reads the environment set just above. */
async function endpointPaths(): Promise<string[]> {
  vi.resetModules()
  const { loginPlugin } = (await import('@/plugins/login')) as {
    loginPlugin: (options: { collections: LoginCollectionConfig[] }) => Plugin
  }

  const config = {
    collections: [{ slug: 'managers', fields: [{ name: 'email', type: 'email' }] }],
  } as unknown as Config

  const folded = (loginPlugin({ collections: [managers] }) as (c: Config) => Config)(config)
  const collection = (folded.collections as CollectionConfig[])[0]!
  return (collection.endpoints as Endpoint[]).map((endpoint) => endpoint.path)
}

describe('the preview secret exchange is wired only on a preview', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.RAILWAY_ENVIRONMENT_NAME
    delete process.env.RAILWAY_ENVIRONMENT
    delete process.env.PREVIEW_ADMIN_PASSWORD
  })

  afterEach(() => {
    process.env = originalEnv
    vi.resetModules()
  })

  it('wires it on a Railway preview holding the secret', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'pr-840'
    process.env.PREVIEW_ADMIN_PASSWORD = 'a-preview-secret'

    expect(await endpointPaths()).toContain(EXCHANGE_PATH)
  })

  it('wires nothing on production, which holds a secret too', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'production'
    process.env.PREVIEW_ADMIN_PASSWORD = 'a-production-secret'

    expect(await endpointPaths()).not.toContain(EXCHANGE_PATH)
  })

  it('wires nothing off Railway — local dev, CI, and both test lanes', async () => {
    // CI genuinely holds this secret, and the integration lane boots the real
    // config, so the Railway check is what keeps the route out of it.
    process.env.PREVIEW_ADMIN_PASSWORD = 'the-ci-secret'

    expect(await endpointPaths()).not.toContain(EXCHANGE_PATH)
  })

  it('wires nothing on a preview forked before the secret existed', async () => {
    process.env.RAILWAY_ENVIRONMENT_NAME = 'pr-123'

    expect(await endpointPaths()).not.toContain(EXCHANGE_PATH)
  })

  it('leaves the sign-in routes alone in every case', async () => {
    expect(await endpointPaths()).toEqual(
      expect.arrayContaining(['/request-magic-link', '/redeem-magic-link', '/redeem-invite']),
    )
  })
})
