import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * A preview's Server Actions arrive through the Cloudflare Worker under
 * Railway's host, so Next rejects every one as cross-site unless the build
 * lists the preview's public host. The picker's sign-in returned a 500 for it.
 *
 * The config composes that host from `@/lib/preview/proxy`, so these cases run
 * the environment-name allowlist through the config rather than through a
 * second copy of the pattern.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('next.config.ts serverActions.allowedOrigins', () => {
  const load = async (name: string | undefined) => {
    vi.resetModules()
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', name)
    vi.stubEnv('RAILWAY_ENVIRONMENT', undefined)
    return (await import('../../next.config')).default
  }

  it.each([
    ['SahajCloud-pr-1082', 'pr-1082.cloud-preview.sydevelopers.com'],
    ['pr-7', 'pr-7.cloud-preview.sydevelopers.com'],
    [' SahajCloud-pr-7 ', 'pr-7.cloud-preview.sydevelopers.com'],
  ])("lists only this preview's public host for %j", async (name, host) => {
    const config = await load(name)
    expect(config.experimental?.serverActions?.allowedOrigins).toEqual([host])
  })

  // ⚠ Production and previews share `sydevelopers.com`, so the session cookie
  // is same-site between them: a preview origin listed here would let a
  // preview's unmerged code run production's actions as its signed-in user.
  //
  // ⚠ An allowlist, not "any name but production". A named non-production
  // environment is reached on a host no Worker answers for, and a prefix from
  // another project is not this project's preview.
  it.each([undefined, '', 'production', 'SahajCloud-staging', 'Other-pr-1082', 'SahajCloud-pr-'])(
    'lists nothing for %j',
    async (name) => {
      const config = await load(name)
      expect(config.experimental?.serverActions).toBeUndefined()
    },
  )
})
