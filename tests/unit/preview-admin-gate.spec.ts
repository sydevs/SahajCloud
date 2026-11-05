import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { managersSignInDirectly } from '@/plugins/previewAdmin'

/**
 * The gate on the preview-admin seeder (sydevs/SahajCloud#662), and on the two
 * things it now also decides: whether `previewAutoSignIn` is on, and whether
 * `/admin/login` lists every account in the environment.
 *
 * `onInit` fires on every boot in every environment, and the sign-in view
 * renders everywhere, so what keeps either from reaching production — or the
 * integration lane's database — is entirely this predicate. Each case below is
 * a place it must not hold.
 *
 * ⚠ **The address arm is gone on purpose.** The gate used to require
 * `PREVIEW_ADMIN_EMAIL`, because the address was the credential. A preview is
 * now reachable only through Cloudflare Access and the proxy gate, so the
 * environment alone decides and the account's address is a committed constant.
 */
describe('managersSignInDirectly', () => {
  const preview = { environmentName: 'pr-662', isProduction: false }

  it('holds on a Railway preview', () => {
    expect(managersSignInDirectly(preview)).toBe(true)
  })

  it('never holds on production', () => {
    // Read from Railway's environment name, never NODE_ENV: a preview runs
    // NODE_ENV=production, the trap that once sent preview mail to real
    // addresses.
    expect(managersSignInDirectly({ environmentName: 'production', isProduction: true })).toBe(
      false,
    )
  })

  it('never holds off Railway, which is local dev, CI and both test lanes', () => {
    // The load-bearing case: `pnpm test:int` boots Payload with NODE_ENV=test
    // and no Railway environment. Holding there would provision an admin into
    // the integration database and make the sign-in page an open account list.
    expect(managersSignInDirectly({ ...preview, environmentName: undefined })).toBe(false)
  })

  it('does not hold for an unnamed environment, whatever else is set', () => {
    // Fail-safe direction: an unknown or misnamed environment signs nobody in
    // rather than guessing it is a preview.
    expect(managersSignInDirectly({ ...preview, environmentName: '' })).toBe(false)
  })
})

describe('the sign-in view', () => {
  const view = readFileSync(
    new URL('../../src/components/admin/SignIn/index.tsx', import.meta.url),
    'utf8',
  )

  it('renders the account picker behind that predicate and nowhere else', () => {
    // ⚠ Source text, because the picker is an anonymous list of every account
    // in the environment and the whole of what keeps it off the live view is
    // one conditional. A second, ungated call site would not fail any other
    // assertion here — the view needs a booted Payload to render.
    const rendered = view.match(/<PreviewPicker/g) ?? []

    expect(rendered).toHaveLength(1)
    // Whitespace-insensitive: Prettier breaks the ternary over three lines
    // once the props are long enough, and has already done so once.
    expect(view.replace(/\s+/g, '')).toContain('previewSignInHere()?(<PreviewPicker')
  })
})
