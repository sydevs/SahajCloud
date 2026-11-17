import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { collections } from '../../src/collections'
import { rootEndpoints } from '../../src/endpoints'
import { globals } from '../../src/globals'
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
  'get /api/clients/{}/secrets/{}', // a stored secret's last 4 characters, for the field's mask
  'post /api/clients/{}/secrets/{}', // the set-secret modal, which stages a key for the next Save
  'post /api/managers/set-project', // the admin project selector
  'post /api/files/{}/transcribe', // Transcribe again, on a file or a Path Step showing it
  'post /api/meditations/{}/transcribe', // the admin transcribe action
  'post /api/users/{}/block', // the admin block action
] as const

/**
 * The root and global endpoints left out of `/api/docs` on purpose. Same rule as above: a literal
 * with a reason per line.
 */
const NOT_DOCUMENTED = [
  // A document the widget frames, not an API: anonymous, unmetered and HTML. The endpoint's own
  // docblock and `docs/rules/endpoints.md` say why it has no OpenAPI entry.
  'get /api/atlas/challenge',
] as const

type Declared = { method: string; path: string }

/** `METHOD /api/path` for every endpoint this repo declares on a collection. */
const declaredEndpoints = (): string[] =>
  (collections as readonly { slug: string; endpoints?: Declared[] }[])
    .flatMap((collection) =>
      (collection.endpoints || []).map(
        (endpoint) =>
          `${endpoint.method} ${normalisePath(`/api/${collection.slug}${endpoint.path}`)}`,
      ),
    )
    .sort()

/**
 * `METHOD /api/path` for every endpoint this repo declares on the config root (`rootEndpoints`) or
 * on a global. Read raw, for the reason in the header: the sanitized config adds Payload's own.
 */
const declaredRootAndGlobalEndpoints = (): string[] =>
  [
    ...rootEndpoints.map(
      (endpoint) => `${endpoint.method} ${normalisePath(`/api${endpoint.path}`)}`,
    ),
    ...(globals as readonly { slug: string; endpoints?: Declared[] }[]).flatMap((global) =>
      (global.endpoints || []).map(
        (endpoint) =>
          `${endpoint.method} ${normalisePath(`/api/globals/${global.slug}${endpoint.path}`)}`,
      ),
    ),
  ].sort()

const documentedEndpoints = (): Set<string> =>
  new Set(
    Object.entries(CUSTOM_ENDPOINT_PATHS).flatMap(([path, item]) =>
      HTTP_METHODS.filter((method) => (item as Record<string, unknown>)[method]).map(
        (method) => `${method} ${normalisePath(path)}`,
      ),
    ),
  )

/**
 * The Next.js route handlers under `src/app/(payload)/api/`, which sit beside Payload's catch-all
 * and so are not in any `endpoints` array. Read off the file tree: a `route.ts` is the only way
 * Next registers one, so the walk misses nothing the framework would serve.
 */
const API_ROOT = path.resolve(__dirname, '../../src/app/(payload)/api')

/** Every `route.ts` below the API root as `METHOD /api/path`, `[param]` spelled `{}`. */
const routeHandlers = (dir = API_ROOT, prefix = '/api'): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // `[...slug]` is Payload's catch-all, below.
      return entry.name.startsWith('[...') ? [] : routeHandlers(full, `${prefix}/${entry.name}`)
    }
    if (entry.name !== 'route.ts') return []
    const source = readFileSync(full, 'utf8')
    const methods = [
      ...source.matchAll(
        /export\s+(?:async\s+function|const|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
      ),
    ].map((match) => match[1].toLowerCase())
    return methods.map(
      (method) => `${method} ${normalisePath(prefix.replace(/\[[^\]]+\]/g, '{}'))}`,
    )
  })

/**
 * The route handlers left out of `/api/docs` on purpose, each with its reason. A literal, like
 * `MANAGER_ONLY`: an entry that an integrator should be able to call is the bug.
 */
const NOT_CLIENT_API = [
  'get /api/health', // Railway's healthcheck and the post-deploy check, not an integrator's call
  'get /api/openapi.json', // the document itself
  'get /api/seed/{}', // an admin session seeds content; no client key reaches it
  'post /api/seed/{}', // the same route, its streaming POST
  'post /api/webhooks/cloudflare-stream', // Cloudflare's signed webhook, never a client
] as const

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

  it('documents every root and global endpoint an API client can call', () => {
    const documented = documentedEndpoints()
    const declared = declaredRootAndGlobalEndpoints()
    expect(declared.length, 'no root endpoint found').toBeGreaterThan(0)
    const missing = declared.filter(
      (key) => !documented.has(key) && !NOT_DOCUMENTED.includes(key as never),
    )
    expect(missing).toEqual([])
  })

  it('keeps no root exemption for an endpoint that is no longer declared', () => {
    const declared = new Set(declaredRootAndGlobalEndpoints())
    expect(NOT_DOCUMENTED.filter((key) => !declared.has(key))).toEqual([])
  })

  // `[...slug]` is skipped by the walk: it is Payload's catch-all, and the two cases above hold
  // the endpoints it dispatches to. It has no path of its own to document.
  it('documents every route handler an API client can call', () => {
    const documented = documentedEndpoints()
    const handlers = routeHandlers()
    expect(handlers.length, 'the walk found no route handlers').toBeGreaterThan(0)
    const missing = handlers.filter(
      (key) => !documented.has(key) && !NOT_CLIENT_API.includes(key as never),
    )
    expect(missing).toEqual([])
  })

  it('keeps no route-handler exemption for a route that no longer exists', () => {
    const present = new Set(routeHandlers())
    expect(NOT_CLIENT_API.filter((key) => !present.has(key))).toEqual([])
  })
})
