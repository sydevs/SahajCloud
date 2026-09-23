import type { CollectionSlug, Plugin } from 'payload'

import { consumeLink } from '@/collections/Managers/endpoints/consumeLink'
import { requestLink } from '@/collections/Managers/endpoints/requestLink'

import { magicLinkIssuedAt } from './fields'

export interface LoginPluginOptions {
  /**
   * The auth collections that get the magic-link field and the two endpoints.
   * A collection named here must hold a session — see `createSession`.
   */
  collections?: CollectionSlug[]
  enabled?: boolean
}

/**
 * The options both configs register this plugin with.
 *
 * **One definition, shared with the test harness**, which builds its own
 * Payload config (`tests/utils/testHelpers.ts`) — a plugin configured in only
 * one of the two behaves differently under test than in production.
 */
export const LOGIN_PLUGIN_OPTIONS: LoginPluginOptions = {
  collections: ['managers'],
}

/**
 * Passwordless sign-in: one hidden timestamp field plus the two endpoints that
 * trade an emailed link for a session (#837).
 *
 * The endpoint definitions live beside their collection, under
 * `src/collections/Managers/endpoints/`, and are only *wired* here — the split
 * `docs/rules/endpoints.md` requires, and the one `formsPlugin` already uses.
 *
 * ⚠ Register it **before** `accessPlugin`, which must stay last. The reason is
 * `accessPlugin`'s own contract, **not** field survival: it re-maps
 * `collection.fields` only for a translatable collection, and `managers` is not
 * one.
 *
 * ⚠ Plugins are folded left to right, **before `sanitizeConfig`**, so this sees
 * the raw config: `collection.auth` may still be the boolean `true`, and
 * `collection.endpoints` may be `undefined`. Both are spread onto rather than
 * replaced — `Managers` already declares `endpoints: [setProject]`, and
 * replacing that array would delete the project switcher.
 *
 * Deliberately `onInit`-free: `config.onInit` is a single function, and
 * `src/payload.config.ts` already points it at `seedPreviewAdmin`.
 *
 * @example
 * ```typescript
 * import { loginPlugin, LOGIN_PLUGIN_OPTIONS } from '@/plugins/login'
 *
 * plugins: [
 *   loginPlugin(LOGIN_PLUGIN_OPTIONS),
 * ]
 * ```
 */
export function loginPlugin(options: LoginPluginOptions = {}): Plugin {
  const { collections = ['managers'], enabled = true } = options

  if (!enabled) return (config) => config

  return (config) => ({
    ...config,
    collections: config.collections?.map((collection) => {
      const slug = collection.slug as CollectionSlug
      if (!collections.includes(slug)) return collection
      return {
        ...collection,
        fields: [...collection.fields, magicLinkIssuedAt],
        endpoints: [...(collection.endpoints || []), requestLink(slug), consumeLink(slug)],
      }
    }),
  })
}
