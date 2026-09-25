/**
 * `loginPlugin`'s wiring (#837, #847).
 *
 * The property under test is **which collections the plugin touches, and what
 * it does to the ones it leaves alone**. Every failure here is silent at
 * runtime: a replaced `endpoints` array deletes the project switcher, a missed
 * collection produces a 404 nobody reads as a config bug, and a slug nobody
 * declared would take the whole config down at boot if it threw.
 *
 * Folded by hand rather than by booting Payload — the plugin is a pure function
 * over a config, and it runs *before* `sanitizeConfig`, which is the state these
 * assertions have to reproduce (`endpoints` still `undefined`).
 */
import type { CollectionConfig, Config, Endpoint, Plugin } from 'payload'

import { describe, expect, it } from 'vitest'

import { loginPlugin, type LoginCollectionConfig } from '@/plugins/login'

const managers: LoginCollectionConfig = {
  slug: 'managers',
  requestPagePath: '/managers/signin',
}

const setProject: Endpoint = { path: '/set-project', method: 'post', handler: () => new Response() }

/** A collection as a plugin sees it: pre-`sanitizeConfig`. */
function collection(slug: string, endpoints?: Endpoint[]): CollectionConfig {
  return { slug, fields: [{ name: 'email', type: 'email' }], ...(endpoints ? { endpoints } : {}) }
}

function fold(plugin: Plugin, ...collections: CollectionConfig[]): CollectionConfig[] {
  return foldConfig(plugin, { collections } as Config).collections as CollectionConfig[]
}

function foldConfig(plugin: Plugin, config: Config): Config {
  return (plugin as (c: Config) => Config)(config)
}

/**
 * The admin block as `src/payload.config.ts` declares it — every component slot
 * it actually uses, so a spread that dropped one shows up here.
 */
function adminConfig(): Config {
  return {
    admin: {
      user: 'managers',
      components: {
        providers: ['@/components/AdminProvider.tsx'],
        beforeNavLinks: ['@/components/admin/ProjectSelector'],
        Nav: '@/components/admin/AtlasNav/AtlasNav',
        beforeDashboard: ['@/components/admin/Dashboard/ProjectSelectionPrompt'],
        graphics: { Logo: '@/components/branding/Logo' },
        views: { analytics: { Component: '@/components/admin/AnalyticsView', path: '/analytics' } },
      },
    },
    collections: [collection('managers')],
  } as unknown as Config
}

/**
 * `<method> <path>` per endpoint. The method is asserted, not just the path:
 * `/redeem-magic-link` answering a GET at all is what would let a mail
 * scanner spend the link, so the absent verb is as load-bearing as the present
 * one.
 */
const routes = (c: CollectionConfig) =>
  (c.endpoints || []).map((e) => `${(e as Endpoint).method} ${(e as Endpoint).path}`)

/** What the plugin wires onto a served collection, in fold order. */
const WIRED_ROUTES = ['post /request-magic-link', 'post /redeem-magic-link']
const fieldNames = (c: CollectionConfig) => c.fields.map((f) => ('name' in f ? f.name : null))

describe('loginPlugin', () => {
  it('adds the field and both endpoints to a configured collection', () => {
    const [wired] = fold(loginPlugin({ collections: [managers] }), collection('managers'))

    expect(fieldNames(wired)).toContain('magicLinkIssuedAt')
    expect(routes(wired)).toEqual(WIRED_ROUTES)
  })

  it('appends to the endpoints a collection already declares', () => {
    // `Managers` declares `[setProject]`. Replacing rather than appending
    // deletes the Current Project switcher, and nothing else would say so.
    const [wired] = fold(
      loginPlugin({ collections: [managers] }),
      collection('managers', [setProject]),
    )

    expect(routes(wired)).toEqual(['post /set-project', ...WIRED_ROUTES])
  })

  it('leaves a collection the option does not name untouched', () => {
    const [, other] = fold(
      loginPlugin({ collections: [managers] }),
      collection('managers'),
      collection('media'),
    )

    expect(fieldNames(other)).not.toContain('magicLinkIssuedAt')
    expect(routes(other)).toEqual([])
  })

  it('wires every collection the option names', () => {
    const [a, b] = fold(
      loginPlugin({
        collections: [managers, { requestPagePath: '/staff/signin', slug: 'staff' as never }],
      }),
      collection('managers'),
      collection('staff'),
    )

    expect(routes(a)).toEqual(WIRED_ROUTES)
    expect(routes(b)).toEqual(WIRED_ROUTES)
  })

  it('ignores an option slug that names no collection', () => {
    // A plugin folds before `sanitizeConfig`, so a throw here takes the whole
    // config down at boot — on a typo in an option. Folded against a real
    // collection on purpose: an empty config never reaches the lookup, so the
    // same assertion over `fold(plugin)` alone would pass without testing it.
    const folded = fold(
      loginPlugin({
        collections: [managers, { requestPagePath: '/nope/signin', slug: 'nope' as never }],
      }),
      collection('managers'),
    )

    expect(folded).toHaveLength(1)
    expect(folded[0]!.slug).toBe('managers')
    expect(routes(folded[0]!)).toEqual(WIRED_ROUTES)
  })

  it('wires nothing when no collection is named, or when disabled', () => {
    const bare = fold(loginPlugin(), collection('managers'))
    const empty = fold(loginPlugin({ collections: [] }), collection('managers'))
    const off = fold(
      loginPlugin({ collections: [managers], enabled: false }),
      collection('managers'),
    )

    for (const [wired] of [bare, empty, off].map((c) => c)) {
      expect(fieldNames(wired)).not.toContain('magicLinkIssuedAt')
      expect(routes(wired)).toEqual([])
    }
  })

  describe('the admin login control', () => {
    const withPage = managers

    it('adds afterLogin pointing at the configured page', () => {
      const folded = foldConfig(loginPlugin({ collections: [withPage] }), adminConfig())

      expect(JSON.stringify(folded.admin?.components?.afterLogin)).toContain(
        '@/components/admin/RequestSignInLink',
      )
      expect(JSON.stringify(folded.admin?.components?.afterLogin)).toContain('/managers/signin')
    })

    it('keeps every component slot the config already declared', () => {
      // The regression: assigning `components` rather than spreading it deletes
      // the project selector, the custom nav, the dashboard prompt and both
      // custom views — and nothing fails until someone opens the admin panel.
      const before = adminConfig()
      const folded = foldConfig(loginPlugin({ collections: [withPage] }), before)
      const components = folded.admin!.components!

      expect(Object.keys(components).sort()).toEqual(
        [...Object.keys(before.admin!.components!), 'afterLogin'].sort(),
      )
      expect(components.beforeNavLinks).toEqual(before.admin!.components!.beforeNavLinks)
      expect(components.Nav).toBe(before.admin!.components!.Nav)
      expect(components.views).toEqual(before.admin!.components!.views)
      expect(components.graphics).toEqual(before.admin!.components!.graphics)
      expect(components.beforeDashboard).toEqual(before.admin!.components!.beforeDashboard)
    })

    it('serves no GET on the redeem path', () => {
      // The scanner defence, stated as an absence: the emailed link addresses
      // `requestPagePath`'s page instead, which writes nothing.
      const [wired] = fold(loginPlugin({ collections: [managers] }), collection('managers'))

      expect(routes(wired)).not.toContain('get /redeem-magic-link')
    })

    it.each(['/\\evil.example.com', '//evil.example.com', 'managers/signin'])(
      'adds no control for %s, which is not site-absolute',
      (requestPagePath) => {
        // The value reaches the control's `to` unprefixed, so a browser would
        // read the leading `/\\` or `//` as an origin and put an off-origin link
        // on the login form.
        const folded = foldConfig(
          loginPlugin({ collections: [{ ...managers, requestPagePath }] }),
          adminConfig(),
        )

        expect(folded.admin?.components?.afterLogin).toBeUndefined()
      },
    )

    it('adds nothing for a collection the admin panel does not authenticate', () => {
      // `afterLogin` is a slot on the one login form, so a second served
      // collection has no form to add to.
      const other: LoginCollectionConfig = {
        requestPagePath: '/clients/signin',
        slug: 'clients' as never,
      }
      const folded = foldConfig(loginPlugin({ collections: [other] }), adminConfig())

      expect(folded.admin?.components?.afterLogin).toBeUndefined()
    })
  })
})
