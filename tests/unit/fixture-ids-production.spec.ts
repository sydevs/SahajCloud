import { describe, expect, it, vi } from 'vitest'

/**
 * Pinned ids are a preview's, never production's (#1168). `allowIDOnCreate`
 * is adapter-wide, so on production a REST create naming an `id` would plant a
 * row ahead of the serial and fail a later insert.
 *
 * The config reads the environment when it is built, so this file builds it
 * once, as production, before anything else imports it.
 */
describe('allowIDOnCreate', () => {
  it('is off on production', async () => {
    vi.stubEnv('RAILWAY_ENVIRONMENT_NAME', 'production')
    const { isProductionDeployment } = await import('@/plugins/storage/previewIsolation')
    expect(isProductionDeployment()).toBe(true)
    const { default: config } = await import('@/payload.config')
    expect((await config).db.allowIDOnCreate).toBe(false)
  }, 60_000)
})
