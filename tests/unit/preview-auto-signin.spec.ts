/**
 * Who signs in without mail, and who gets passwords taken away (#840).
 *
 * `disableLocalStrategy` closes `POST /api/managers/login`, and the smoke lane was
 * its only non-human caller. What replaces it is a flag the environment sets:
 * `issueMagicLink` mints a session for **any** manager instead of mailing a
 * link, so a reviewer can be any manager in a preview and neither CI nor the
 * loop needs a credential of its own.
 *
 * ⚠ **`passwordless` is per collection, not a branch inside a handler.** Applied
 * plugin-wide it would rewrite the auth columns of the next slug added to
 * `collections`, so it is asserted by folding the plugin and reading what came
 * out. `previewAutoSignIn` needs no such guard: it is a value on one entry, which
 * `payload.config.ts` spreads onto `managers` alone.
 *
 * What the option DOES once set is `tests/int/preview-auto-signin.int.spec.ts`.
 * The gate around the deployment itself is `preview-admin-gate.spec.ts`.
 */
import type { CollectionConfig, Config, Endpoint } from 'payload'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loginPlugin, type LoginCollectionConfig } from '@/plugins/login'

const managers: LoginCollectionConfig = {
  slug: 'managers',
  passwordless: true,
  previewAutoSignIn: true,
  requestPagePath: '/admin/login',
}

/** A second served collection, to drive the per-collection half of both options. */
const clients: LoginCollectionConfig = {
  slug: 'clients',
  requestPagePath: '/clients/signin',
}

/** `managers` as production, CI and local dev supply it. */
const withoutCredential: LoginCollectionConfig = { ...managers, previewAutoSignIn: false }

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

describe('the preview auto sign-in', () => {
  it('adds no route of its own — the request endpoint is the whole surface', () => {
    // ⚠ The failure this exists for: the shape it replaced was a preview-only
    // endpoint, and a route that existed everywhere and refused everywhere would
    // be one env-var typo away from a way in on production. There is no route to
    // get wrong now, and this is what says so.
    const onPreview = paths(fold({ collections: [managers] }, 'managers').managers!)
    const without = paths(fold({ collections: [withoutCredential] }, 'managers').managers!)

    expect(onPreview).toEqual(without)
    expect(onPreview).toEqual(expect.arrayContaining(['/request-magic-link', '/redeem']))
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

describe('previewSignInHere', () => {
  const setEnv = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    setEnv({ RAILWAY_ENVIRONMENT_NAME: undefined })
  })

  /** Re-imported per case: the deployment name is read when the module parses. */
  const resolve = async () => {
    const mod = await import('@/plugins/previewAdmin')
    return mod.previewSignInHere()
  }

  it('holds on a Railway preview', async () => {
    setEnv({ RAILWAY_ENVIRONMENT_NAME: 'pr-861' })

    expect(await resolve()).toBe(true)
  })

  it('does not hold off Railway — local dev, CI, the test lanes', async () => {
    setEnv({ RAILWAY_ENVIRONMENT_NAME: undefined })

    expect(await resolve()).toBe(false)
  })

  it('does not hold on production', async () => {
    setEnv({ RAILWAY_ENVIRONMENT_NAME: 'production' })

    expect(await resolve()).toBe(false)
  })
})
