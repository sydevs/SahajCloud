import type { LoginCollectionConfig } from './types'
import type { Config, Field, Plugin } from 'payload'

import { redeemMagicLink } from './endpoints/redeemMagicLink'
import { requestMagicLink } from './endpoints/requestMagicLink'

/**
 * When the outstanding sign-in link was minted.
 *
 * Three jobs in one timestamp: it is `requestMagicLink`'s throttle window, it
 * is the claim `redeemMagicLink` matches exactly (so a link works once), and
 * clearing it is what a fresh request does to the outstanding link.
 *
 * ⚠ **`update: () => false` is what keeps both endpoints its only writers.**
 * Self-access grants an account holder update on their own document, so without
 * it they could burn their own outstanding link, or stamp it in the future and
 * throttle their own sends forever. Both endpoints write it through
 * `overrideAccess: true`, so neither is affected.
 */
export const magicLinkIssuedAt: Field = {
  name: 'magicLinkIssuedAt',
  type: 'date',
  admin: {
    hidden: true,
  },
  access: {
    update: () => false,
  },
}

export interface LoginPluginOptions {
  /**
   * The auth collections to wire, one entry each. An empty list wires nothing.
   *
   * ⚠ A slug that names no collection is **silently ignored**, because plugins
   * fold before `sanitizeConfig` and throwing here would take the whole config
   * down on a typo. `tests/unit/login-plugin.spec.ts` pins that.
   */
  collections?: LoginCollectionConfig[]
  enabled?: boolean
}

/**
 * ⚠ **A second `/` or `\` makes it off-origin.** This value reaches
 * `RequestSignInLink`'s `to` unprefixed, and a browser normalises `/\host` to
 * the protocol-relative `//host` — so testing for `//` alone leaves a way onto
 * the login form. The plugin's other two consumers compose it after an absolute
 * origin, which is why this is the only place that has to ask.
 */
const isSiteAbsolute = (path: string) => path.startsWith('/') && !/^\/[/\\]/.test(path)

/**
 * Put the "Email me a sign-in link" control under the admin login form.
 *
 * ⚠ **Every key of `admin` and of `admin.components` is spread, never
 * replaced.** `src/payload.config.ts` declares `providers`, `beforeNavLinks`,
 * `Nav`, `beforeDashboard`, `graphics` and `views` there — assigning a fresh
 * object would delete the project selector, the custom nav and both custom
 * views, and nothing would fail until someone opened the admin panel.
 *
 * Only the collection the admin panel authenticates gets one: `afterLogin` is a
 * slot on that one form, so a second served collection has no form to add to.
 */
function adminWithSignInLink(
  admin: Config['admin'],
  byslug: Map<string, LoginCollectionConfig>,
): Config['admin'] {
  const entry = admin?.user ? byslug.get(admin.user) : undefined
  if (!entry || !isSiteAbsolute(entry.requestPagePath)) return admin

  return {
    ...admin,
    components: {
      ...admin?.components,
      afterLogin: [
        ...(admin?.components?.afterLogin ?? []),
        {
          path: '@/components/admin/RequestSignInLink',
          clientProps: { href: entry.requestPagePath },
        },
      ],
    },
  }
}

/**
 * Passwordless sign-in: one hidden timestamp field plus the two endpoints that
 * trade an emailed link for a session (#837).
 *
 * Both endpoint definitions live under `./endpoints/` and are built per
 * configured collection, so the plugin owns the whole feature rather than wiring
 * definitions kept beside one collection. `./mail.ts` renders and addresses the
 * message for every served collection, so a `LoginCollectionConfig` supplies
 * only what reads a field this plugin cannot know the name of — the eligibility
 * predicate and the branding project. `src/collections/Managers/login.ts` is the
 * one in use.
 *
 * ⚠ Register it **before** `accessPlugin`, which must stay last. The reason is
 * `accessPlugin`'s own contract, **not** field survival: it re-maps
 * `collection.fields` only for a translatable collection, and `managers` is not
 * one.
 *
 * ⚠ Plugins are folded left to right, **before `sanitizeConfig`**, so
 * `collection.endpoints` may still be `undefined`. The array is spread onto
 * rather than replaced — `Managers` already declares `endpoints: [setProject]`,
 * and replacing it would delete the project switcher.
 *
 * Deliberately `onInit`-free: `config.onInit` is a single function, and
 * `src/payload.config.ts` already points it at `seedPreviewAdmin`.
 *
 * @example
 * ```typescript
 * import { managersLogin } from '@/collections/Managers/login'
 * import { loginPlugin } from '@/plugins/login'
 *
 * plugins: [
 *   loginPlugin({ collections: [managersLogin] }),
 *   // accessPlugin stays last
 * ]
 * ```
 */
export function loginPlugin(options: LoginPluginOptions = {}): Plugin {
  const { collections = [], enabled } = options
  if (enabled === false || collections.length === 0) return (config) => config

  const byslug = new Map(collections.map((entry) => [entry.slug as string, entry]))

  return (config) => ({
    ...config,
    admin: adminWithSignInLink(config.admin, byslug),
    collections: config.collections?.map((collection) => {
      const entry = byslug.get(collection.slug)
      if (!entry) return collection

      return {
        ...collection,
        fields: [...collection.fields, magicLinkIssuedAt],
        endpoints: [
          ...(collection.endpoints || []),
          requestMagicLink(entry),
          // ⚠ `POST`-only, and that is the whole defence against a mail scanner
          // spending the link. The `GET` a delivered link performs is answered by
          // `requestPagePath`'s own page, which writes nothing.
          redeemMagicLink(entry),
        ],
      }
    }),
  })
}
