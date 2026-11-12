import { describe, expect, it } from 'vitest'

import { collections } from '../../src/collections'
import { CUSTOM_ENDPOINT_PATHS } from '../../src/plugins/openapi/customEndpoints'

/**
 * Every custom endpoint an API client can call is in the hand-written OpenAPI document. The
 * opposite direction — the document names only what the config registers — lives in
 * `sanitized-config-rules.spec.ts`, which needs the sanitized config. This one must not share a
 * module graph with it: `buildConfig` mutates the raw collection configs in place, appending
 * Payload's own 440-odd REST routes to the same `endpoints` array, and `payload-oapi` generates
 * the document for those. Imported alone, the barrel yields only what this repo declares.
 *
 * `payload-oapi` generates nothing for a custom endpoint, so an endpoint missing from the shim is
 * invisible in `/api/docs` with nothing going red.
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/** Payload spells a route parameter `:id`, OpenAPI `{id}`; a `.ics`-style suffix has no Payload
 *  spelling. Mirrors `normalisePath` in `sanitized-config-rules.spec.ts`. */
const normalisePath = (path: string): string => path.replace(/\{[^}]+\}(\.\w+)?|:\w+/g, '{}')

/**
 * The custom endpoints left out of `/api/docs` on purpose. Each one authenticates a **manager**
 * (`requireActiveManager` or `requireManagerPermission`) and accepts no client API key, so no
 * integrator can reach it. An entry that does take a client key is the bug, so this is a literal
 * with a reason per line rather than a predicate over handlers.
 */
const MANAGER_ONLY = [
  'get /api/events/{}/registrations/csv', // the Registrations tab's download button
  'post /api/events/{}/verify', // the verification reminder's one-click action
  'post /api/clients/{}/verify-embed', // the Install tab's on-demand re-check
  'post /api/clients/{}/email-preview', // the Atlas tab's sample registrant email
  'post /api/managers/set-project', // the admin project selector
  'post /api/meditations/{}/transcribe', // the admin transcribe action
  'post /api/users/{}/block', // the admin block action
] as const

/** `METHOD /api/path` for every endpoint this repo declares on a collection. */
const declaredEndpoints = (): string[] =>
  (collections as readonly { slug: string; endpoints?: { method: string; path: string }[] }[])
    .flatMap((collection) =>
      (collection.endpoints || []).map(
        (endpoint) =>
          `${endpoint.method} ${normalisePath(`/api/${collection.slug}${endpoint.path}`)}`,
      ),
    )
    .sort()

const documentedEndpoints = (): Set<string> =>
  new Set(
    Object.entries(CUSTOM_ENDPOINT_PATHS).flatMap(([path, item]) =>
      HTTP_METHODS.filter((method) => (item as Record<string, unknown>)[method]).map(
        (method) => `${method} ${normalisePath(path)}`,
      ),
    ),
  )

describe('custom endpoint coverage (OpenAPI)', () => {
  it('documents every collection endpoint an API client can call', () => {
    const documented = documentedEndpoints()
    const missing = declaredEndpoints().filter(
      (key) => !documented.has(key) && !MANAGER_ONLY.includes(key as never),
    )
    expect(missing).toEqual([])
  })

  // A stale entry would silently excuse an endpoint that later became client-facing.
  it('keeps no exemption for an endpoint the collections no longer declare', () => {
    const declared = new Set(declaredEndpoints())
    expect(MANAGER_ONLY.filter((key) => !declared.has(key))).toEqual([])
  })
})
