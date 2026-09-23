import type { Plugin } from 'payload'

import { consumeLink } from '@/collections/Managers/endpoints/consumeLink'
import { requestLink } from '@/collections/Managers/endpoints/requestLink'

import { magicLinkIssuedAt } from './fields'

export interface LoginPluginOptions {
  enabled?: boolean
}

/** The one collection this plugin wires. See the docblock below. */
const TARGET = 'managers'

/**
 * Passwordless sign-in: one hidden timestamp field plus the two endpoints that
 * trade an emailed link for a session (#837).
 *
 * The endpoint definitions live beside their collection, under
 * `src/collections/Managers/endpoints/`, and are only *wired* here — the split
 * `docs/rules/endpoints.md` requires, and the one `formsPlugin` already uses.
 *
 * ⚠ **Keyed on the literal slug, like `formsPlugin`.** A `collections` option
 * would read as a knob this feature cannot honour: the routes branch on
 * `type === 'inactive'`, an enum only `managers` declares, they send from
 * `MANAGER_EMAIL_FROM` with a manager-shaped template, and the token audiences
 * are `manager-signin` / `manager-invite`. `createSession` is the piece a
 * second auth collection really does reuse, and that one takes a slug.
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
 * import { loginPlugin } from '@/plugins/login'
 *
 * plugins: [
 *   loginPlugin(),
 *   // accessPlugin stays last
 * ]
 * ```
 */
export function loginPlugin(options: LoginPluginOptions = {}): Plugin {
  if (options.enabled === false) return (config) => config

  return (config) => ({
    ...config,
    collections: config.collections?.map((collection) =>
      collection.slug === TARGET
        ? {
            ...collection,
            fields: [...collection.fields, magicLinkIssuedAt],
            endpoints: [...(collection.endpoints || []), requestLink, consumeLink],
          }
        : collection,
    ),
  })
}
