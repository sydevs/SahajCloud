/**
 * Who gets a preview session exchange, and who gets passwords taken away (#840).
 *
 * `disableLocalStrategy` closes `POST /api/managers/login`, and the smoke lane
 * was its only non-human caller. What replaces it trades
 * `PREVIEW_ADMIN_PASSWORD` for a session — the secret a Railway preview already
 * holds, so no new CI secret exists to leak.
 *
 * ⚠ **Both properties are about WIRING, not about a branch inside a handler.**
 * A route that existed everywhere and refused everywhere would be one env-var
 * typo away from a password login on production, and a `passwordless` applied
 * plugin-wide would rewrite the auth columns of the next slug added to
 * `collections`. So both are asserted by folding the plugin and reading what
 * came out.
 *
 * `previewSecretExchange()` — which reads the environment and decides whether
 * there is a credential at all — sits one layer down, beside the gate
 * `preview-admin-gate.spec.ts` covers.
 */
import type { CollectionConfig, Config, Endpoint } from 'payload'

import { describe, expect, it } from 'vitest'

import {
  loginPlugin,
  type LoginCollectionConfig,
  type PreviewSecretExchange,
} from '@/plugins/login'
// ⚠ The real constant, not a copy: most cases below assert the path is ABSENT,
// and a stale literal would satisfy every one of them forever.
import { EXCHANGE_PREVIEW_SECRET_PATH } from '@/plugins/login/endpoints/exchangePreviewSecret'

const managers: LoginCollectionConfig = {
  slug: 'managers',
  passwordless: true,
  requestPagePath: '/managers/signin',
}

/** A second served collection, to drive the per-collection half. */
const clients: LoginCollectionConfig = {
  slug: 'clients',
  requestPagePath: '/clients/signin',
}

const PREVIEW: PreviewSecretExchange = {
  email: 'preview-admin@example.com',
  password: 'a-preview-secret',
}

/** A collection as a plugin sees it: pre-`sanitizeConfig`, `endpoints` unset. */
function collection(slug: string): CollectionConfig {
  return { slug, fields: [{ name: 'email', type: 'email' }], auth: { maxLoginAttempts: 5 } }
}

function fold(
  options: Parameters<typeof loginPlugin>[0],
  ...slugs: string[]
): Record<string, CollectionConfig> {
  const config = { collections: slugs.map(collection) } as unknown as Config
  const folded = (loginPlugin(options) as (c: Config) => Config)(config)
  return Object.fromEntries(
    (folded.collections as CollectionConfig[]).map((entry) => [entry.slug, entry]),
  )
}

const paths = (entry: CollectionConfig) => (entry.endpoints as Endpoint[]).map((e) => e.path)

describe('the preview secret exchange', () => {
  it('is wired on every served collection when a credential is supplied', () => {
    const folded = fold(
      { collections: [managers, clients], previewExchange: PREVIEW },
      'managers',
      'clients',
    )

    expect(paths(folded.managers!)).toContain(EXCHANGE_PREVIEW_SECRET_PATH)
    expect(paths(folded.clients!)).toContain(EXCHANGE_PREVIEW_SECRET_PATH)
  })

  it('is absent with no credential — production, CI, local dev, an old preview', () => {
    const folded = fold({ collections: [managers] }, 'managers')

    expect(paths(folded.managers!)).not.toContain(EXCHANGE_PREVIEW_SECRET_PATH)
  })

  it('leaves the sign-in routes alone either way', () => {
    const withCredential = fold({ collections: [managers], previewExchange: PREVIEW }, 'managers')
    const without = fold({ collections: [managers] }, 'managers')

    for (const folded of [withCredential, without]) {
      expect(paths(folded.managers!)).toEqual(
        expect.arrayContaining(['/request-magic-link', '/redeem-magic-link', '/redeem-invite']),
      )
    }
  })
})

describe('taking passwords away', () => {
  it('uses the object form, so the columns the sign-in flow needs survive', () => {
    const folded = fold({ collections: [managers] }, 'managers')

    expect(folded.managers!.auth).toMatchObject({
      disableLocalStrategy: { enableFields: true },
      maxLoginAttempts: 0,
    })
  })

  it('touches only the entries that ask', () => {
    // ⚠ The failure this exists for: `clients` needs the bare
    // `disableLocalStrategy: true`, so serving it here must not hand it the
    // object form — that would add `email`, `_verified` and `sessions` columns
    // from a one-line edit to a `collections:` array.
    const folded = fold({ collections: [managers, clients] }, 'managers', 'clients')

    expect(folded.clients!.auth).toEqual({ maxLoginAttempts: 5 })
  })

  it('leaves a collection the plugin does not serve completely alone', () => {
    const folded = fold({ collections: [managers] }, 'managers', 'clients')

    expect(folded.clients!.auth).toEqual({ maxLoginAttempts: 5 })
    expect(folded.clients!.endpoints).toBeUndefined()
  })
})
