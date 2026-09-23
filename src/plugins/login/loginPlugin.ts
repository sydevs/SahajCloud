import type { LoginCollectionConfig } from './types'
import type { Plugin } from 'payload'

import { consumeSessionLink } from './endpoints/consumeSessionLink'
import { requestSessionLink } from './endpoints/requestSessionLink'
import { magicLinkIssuedAt } from './fields'

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
 * definitions kept beside one collection. What stays with a collection is its
 * own `LoginCollectionConfig` — the eligibility predicate and the mail — because
 * those are its branding and its schema, not this plugin's.
 * `src/collections/Managers/login.ts` is the one in use.
 *
 * ⚠ **`mail` is required per collection, and that is deliberate.** The routes
 * cannot mail generically: the sender, the subject and the template belong to
 * the collection. A plugin-supplied default would silently mail a second
 * collection as if it were `managers`, which is the footgun a bare slug list
 * would have shipped.
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
        endpoints: [...(collection.endpoints || []), requestSessionLink(entry), consumeSessionLink(entry)],
      }
    }),
  })
}
