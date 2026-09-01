import { describe, expect, it } from 'vitest'

import { shouldSeedPreviewAdmin } from '@/plugins/previewAdmin'

/**
 * The gate on the preview-admin seeder (sydevs/SahajCloud#662).
 *
 * `onInit` fires on every boot in every environment, so what keeps this from writing an
 * admin into production — or into the integration lane's database, where CI genuinely
 * does hold `PREVIEW_ADMIN_PASSWORD` — is entirely this predicate. Each case below is a
 * place it must not run.
 */
describe('shouldSeedPreviewAdmin', () => {
  const preview = {
    environmentName: 'pr-662',
    isProduction: false,
    password: 'a-preview-password',
  }

  it('seeds on a Railway preview holding a password', () => {
    expect(shouldSeedPreviewAdmin(preview)).toBe(true)
  })

  it('never seeds on production, even though production holds a password', () => {
    expect(
      shouldSeedPreviewAdmin({ ...preview, environmentName: 'production', isProduction: true }),
    ).toBe(false)
  })

  it('never seeds off Railway, which is local dev, CI and both test lanes', () => {
    // The load-bearing case: `pnpm test:int` boots Payload with NODE_ENV=test and no
    // Railway environment. If the gate read only the password, a CI run holding the
    // secret would provision an admin into the integration database.
    expect(shouldSeedPreviewAdmin({ ...preview, environmentName: undefined })).toBe(false)
  })

  it('does not seed an environment forked before the password variable existed', () => {
    // Explicitly out of scope on the ticket: pre-2026-08-27 previews never receive
    // PREVIEW_ADMIN_PASSWORD and keep the admin they were already seeded with.
    expect(shouldSeedPreviewAdmin({ ...preview, password: undefined })).toBe(false)
    expect(shouldSeedPreviewAdmin({ ...preview, password: '' })).toBe(false)
  })

  it('does not seed an unnamed environment, whatever else is set', () => {
    // Fail-safe direction: an unknown or misnamed environment seeds nothing rather than
    // guessing it is a preview.
    expect(
      shouldSeedPreviewAdmin({ environmentName: '', isProduction: false, password: 'p' }),
    ).toBe(false)
  })
})
