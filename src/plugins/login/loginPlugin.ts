import type { LoginCollectionConfig } from './types'
import type { Field, Plugin } from 'payload'

import { redeemMagicLink } from './endpoints/redeemMagicLink'
import { requestSessionLink } from './endpoints/requestSessionLink'

/**
 * When the outstanding sign-in link was minted.
 *
 * Three jobs in one timestamp: it is `requestSessionLink`'s throttle window, it
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
    collections: config.collections?.map((collection) => {
      const entry = byslug.get(collection.slug)
      if (!entry) return collection

      return {
        ...collection,
        fields: [...collection.fields, magicLinkIssuedAt],
        endpoints: [...(collection.endpoints || []), requestSessionLink(entry), redeemMagicLink(entry)],
      }
    }),
  })
}
