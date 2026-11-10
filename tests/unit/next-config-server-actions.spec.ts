import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isPreviewEnvironmentName,
  previewHostname,
  previewNumberFromEnvironmentName,
} from '@/lib/preview/proxy'

import { previewPublicHost } from '../../next.config.mjs'

/**
 * A preview's Server Actions arrive through the Cloudflare Worker under
 * Railway's host, so Next rejects every one as cross-site unless the build
 * lists the preview's public host. The picker's sign-in returned a 500 for it.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('previewPublicHost', () => {
  it.each(['SahajCloud-pr-1082', 'pr-1082', ' SahajCloud-pr-7 '])(
    'agrees with the proxy helpers for %j',
    (name) => {
      expect(isPreviewEnvironmentName(name)).toBe(true)
      expect(previewPublicHost(name)).toBe(previewHostname(previewNumberFromEnvironmentName(name)!))
    },
  )

  it.each([undefined, '', 'production', 'SahajCloud-staging', 'Other-pr-1082', 'SahajCloud-pr-'])(
    'is null off a preview: %j',
    (name) => {
      expect(isPreviewEnvironmentName(name)).toBe(false)
      expect(previewPublicHost(name)).toBeNull()
    },
  )
})

describe('next.config.mjs serverActions.allowedOrigins', () => {
  const load = async () => (await import('../../next.config.mjs')).default

  it("lists only this preview's public host on a preview build", async () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'SahajCloud-pr-1082')
    const config = await load()
    expect(config.experimental?.serverActions?.allowedOrigins).toEqual([
      'pr-1082.cloud-preview.sydevelopers.com',
    ])
  })

  // ⚠ Production and previews share `sydevelopers.com`, so the session cookie
  // is same-site between them: a preview origin listed here would let a
  // preview's unmerged code run production's actions as its signed-in user.
  it('lists nothing on production or a local build', async () => {
    for (const name of ['production', undefined]) {
      vi.resetModules()
      vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', name)
      vi.stubEnv('RAILWAY_ENVIRONMENT', undefined)
      const config = await load()
      expect(config.experimental?.serverActions).toBeUndefined()
    }
  })
})
