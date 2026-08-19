import { serverEnv } from '@/lib/env/server'

/**
 * Cloudflare Browser Rendering — render a third-party page and hand back its DOM.
 *
 * Used to confirm an embed actually booted before its mount may yield a canonical URL. A real
 * browser is the only thing that can answer that: the widget is JavaScript, so fetching HTML would
 * only prove a `<script>` tag exists, and would false-FAIL every site that renders client-side.
 *
 * Follows the outbound-HTTP idiom already used by `@/lib/turnstile` and `@/lib/mapbox` —
 * `AbortSignal.timeout()`, and **never throw**: every failure resolves to a result object, because
 * the caller has to tell "their embed is broken" from "we could not look", and an exception erases
 * that distinction.
 */

const ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts'

/** Long enough for a slow third-party page plus the widget's own idle-time boot. */
const RENDER_TIMEOUT_MS = 45_000

export type RenderResult =
  | { ok: true; html: string }
  /** The page itself is at fault — this is evidence about the embed. */
  | { ok: false; kind: 'navigation' | 'selector-timeout'; detail: string }
  /** We could not look. Never evidence about the embed. */
  | { ok: false; kind: 'unconfigured' | 'provider' | 'quota'; detail: string }

/**
 * Classify a Cloudflare error message.
 *
 * The REST API reports navigation failures and selector timeouts through the same error channel as
 * its own faults, so the message is all there is to go on. **Anything unrecognised is treated as
 * our fault, not theirs** — a misread here would auto-disable a working canonical, which is the one
 * outcome worth biasing hard against.
 */
export function classifyRenderError(message: string): Extract<RenderResult, { ok: false }>['kind'] {
  const text = message.toLowerCase()
  // Quota first, deliberately: "daily quota exceeded" also matches the timeout pattern below, and
  // reading our own exhausted quota as their embed timing out would count a failure against them.
  if (/quota|rate limit|too many requests/.test(text)) return 'quota'
  if (/net::|dns|name_not_resolved|connection|navigat|err_/.test(text)) return 'navigation'
  if (/timeout|waiting for selector|exceeded/.test(text)) return 'selector-timeout'
  return 'provider'
}

export interface RenderDeps {
  fetchFn?: typeof fetch
}

/**
 * Render `url` and return its DOM once `waitForSelector` appears.
 *
 * Waiting on the selector rather than polling the returned HTML is what makes the widget's
 * idle-time boot survivable: the render simply does not resolve until the marker is written, and a
 * page that never writes one comes back as `selector-timeout`.
 */
export async function renderPage(
  url: string,
  waitForSelector: string,
  deps: RenderDeps = {},
): Promise<RenderResult> {
  const accountId = serverEnv.CLOUDFLARE_ACCOUNT_ID
  const token = serverEnv.CLOUDFLARE_API_KEY
  if (!accountId || !token) {
    return { ok: false, kind: 'unconfigured', detail: 'Cloudflare credentials are not configured.' }
  }

  const doFetch = deps.fetchFn ?? fetch

  let response: Response
  try {
    response = await doFetch(`${ENDPOINT}/${accountId}/browser-rendering/content`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        url,
        waitForSelector: { selector: waitForSelector, timeout: 15_000 },
        gotoOptions: { waitUntil: 'networkidle0', timeout: 30_000 },
      }),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    })
  } catch (error) {
    // A timeout or socket error on our side says nothing about their page.
    return {
      ok: false,
      kind: 'provider',
      detail: error instanceof Error ? error.message : String(error),
    }
  }

  if (response.status === 429) {
    return { ok: false, kind: 'quota', detail: 'Browser Rendering rate limit reached.' }
  }

  let body: { success?: boolean; result?: string; errors?: { message?: string }[] }
  try {
    body = (await response.json()) as typeof body
  } catch {
    return { ok: false, kind: 'provider', detail: `Unparseable response (${response.status}).` }
  }

  if (!response.ok || body.success !== true || typeof body.result !== 'string') {
    const detail = body.errors?.map((e) => e.message).filter(Boolean).join('; ') || `HTTP ${response.status}`
    return { ok: false, kind: classifyRenderError(detail), detail }
  }

  return { ok: true, html: body.result }
}
