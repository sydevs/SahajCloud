import { describe, expect, it } from 'vitest'

import { resolvePreviewAdminEmail } from '@/plugins/previewAdmin'

/**
 * The gate on the preview-admin seeder (sydevs/SahajCloud#662).
 *
 * `onInit` fires on every boot in every environment, so what keeps this from writing an
 * admin into production — or into the integration lane's database, where CI genuinely
 * does hold `PREVIEW_ADMIN_EMAIL` — is entirely this predicate. Each case below is a
 * place it must not run.
 */
describe('resolvePreviewAdminEmail', () => {
  const preview = {
    email: 'preview-admin@sydevelopers.test',
    environmentName: 'pr-662',
    isProduction: false,
  }

  it('seeds on a Railway preview holding an address', () => {
    expect(resolvePreviewAdminEmail(preview)).toBe(preview.email)
  })

  it('never seeds on production, whatever else is set', () => {
    expect(
      resolvePreviewAdminEmail({ ...preview, environmentName: 'production', isProduction: true }),
    ).toBeUndefined()
  })

  it('never seeds off Railway, which is local dev, CI and both test lanes', () => {
    // The load-bearing case: `pnpm test:int` boots Payload with NODE_ENV=test and no
    // Railway environment. If the gate read only the address, a CI run holding the
    // secret would provision an admin into the integration database.
    expect(resolvePreviewAdminEmail({ ...preview, environmentName: undefined })).toBeUndefined()
  })

  it('does not seed an environment that names no address', () => {
    // Two cases in one: a preview forked before the variable existed (out of scope on
    // the ticket, keeping the admin it was already seeded with), and — since #840 — one
    // whose admin would otherwise be openable by anyone who guessed a default address.
    expect(resolvePreviewAdminEmail({ ...preview, email: undefined })).toBeUndefined()
    expect(resolvePreviewAdminEmail({ ...preview, email: '' })).toBeUndefined()
    expect(resolvePreviewAdminEmail({ ...preview, email: '   ' })).toBeUndefined()
  })

  it('does not seed an unnamed environment, whatever else is set', () => {
    // Fail-safe direction: an unknown or misnamed environment seeds nothing rather than
    // guessing it is a preview.
    expect(
      resolvePreviewAdminEmail({ ...preview, environmentName: '' }),
    ).toBeUndefined()
  })
})
