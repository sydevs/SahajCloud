/**
 * The Cloudflare Worker in front of every Railway preview of this app.
 *
 * It is reached at one fixed hostname per pull request —
 * `pr-<n>.cloud-preview.sydevelopers.com`, a Workers Custom Domain created on
 * the PR's first push — looks the PR's Railway host up in KV, and passes the
 * request on with the shared-secret header the app's gate requires.
 *
 * Cloudflare Access sits **ahead** of this: for a Custom Domain, every request
 * is checked before the Worker runs, so nothing here authenticates anyone. A
 * worker-level Access app covers every address this Worker answers on, which is
 * why there is one app and not one per PR.
 *
 * ⚠ **Deployed by hand, not from CI.** The pull request that ships this gate
 * gates its own preview, so a broken Worker deployed from inside that PR could
 * not be fixed from inside it. See the ticket's step 0.
 *
 * No dependency: `wrangler deploy` bundles this file, and the types below are
 * the slice of the Workers runtime it actually uses.
 */
import {
  PREVIEW_PROXY_SECRET_HEADER,
  previewHostKey,
  previewNumberFromProxyHost,
} from '../src/lib/preview/proxy'

/** The KV namespace binding, narrowed to the one read this Worker makes. */
export interface PreviewHostStore {
  get(key: string): Promise<null | string>
}

export interface Env {
  /** `pr-<n>` → the Railway host `scripts/get-railway-preview-url.ts` discovered. */
  PREVIEW_HOSTS: PreviewHostStore
  /** The value the app's gate requires, shared with Railway's preview variables. */
  PREVIEW_PROXY_SECRET: string
}

/**
 * Cloudflare's `cf` request option. It is absent from `lib.dom`, and the
 * `cacheTtl: -1` below is half of never-cache: Workers run **ahead** of the
 * cache, so the zone's cache-phase rule is evaluated on this subrequest rather
 * than on the inbound request. The response header is the other half, and
 * neither alone covers both hops.
 *
 * ⚠ It needs the `request_cf_overrides_cache_rules` compatibility flag on the
 * account, or the override is ignored silently.
 */
type ProxyInit = RequestInit & { cf?: { cacheTtl?: number } }

/** Never-cache, stamped on everything this Worker returns. */
const NO_STORE = 'private, no-store'

const plain = (status: number, body: string): Response =>
  new Response(`${body}\n`, {
    status,
    headers: { 'Cache-Control': NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' },
  })

/**
 * Proxy one request to its PR's Railway host.
 *
 * `fetcher` is injected so `tests/unit/preview-proxy.spec.ts` can assert the
 * subrequest without a network; the Worker itself passes the global `fetch`.
 */
export async function handle(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url)
  const pr = previewNumberFromProxyHost(url.hostname)
  if (!pr) return plain(404, `No preview is served at ${url.hostname}.`)

  const upstreamHost = await env.PREVIEW_HOSTS.get(previewHostKey(pr))
  if (!upstreamHost) {
    return plain(
      503,
      `Pull request #${pr} has no Railway preview yet. Its address is registered once CI ` +
        `discovers the deploy.`,
    )
  }

  // ⚠ **Never `new URL(path, base)`.** A relative reference beginning `//` is
  // scheme-relative, so it REPLACES the base's authority: a request for
  // `//evil.example/x` proxied to `https://evil.example/x`, carrying the shared
  // secret, the caller's cookies and their Access assertion, and returned under
  // this preview's own origin. Assigning the parts keeps the host.
  const target = new URL(`https://${upstreamHost}`)
  target.pathname = url.pathname
  target.search = url.search
  const headers = new Headers(request.headers)
  headers.set(PREVIEW_PROXY_SECRET_HEADER, env.PREVIEW_PROXY_SECRET)

  const init: ProxyInit = {
    method: request.method,
    headers,
    body: request.body,
    // The app's own 302s — a sign-in redeem, Payload's admin redirects — are
    // the visitor's to follow at the fixed address. Following them here would
    // resolve them against the Railway host.
    redirect: 'manual',
    cf: { cacheTtl: -1 },
  }

  const upstream = await fetcher(target, init)

  // ⚠ **Hand the body straight back.** `POST /api/seed/<script>` streams its
  // progress as SSE with a heartbeat every 5 s, so reading the body to
  // completion before responding would hold the whole fill and report nothing
  // until it ended.
  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  })
  response.headers.set('Cache-Control', NO_STORE)
  return response
}

const worker = {
  fetch: (request: Request, env: Env): Promise<Response> => handle(request, env),
}

export default worker
