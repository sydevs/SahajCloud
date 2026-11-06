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
 * Cloudflare error codes, observed live against the REST API (2026-08-19).
 *
 * Codes rather than prose: the API reports the customer's failures and its own through one error
 * channel, and the messages are generic enough to be dangerous to pattern-match
 * (`Network connection closed.` for a dead domain). The numbers are stable and unambiguous.
 */
const RENDER_ERROR_CODES: Record<number, Extract<RenderResult, { ok: false }>['kind']> = {
  // "A timeout was reached. Check gotoOptions/waitForSelector/…" — the marker never appeared.
  6002: 'selector-timeout',
  // "Network connection closed." / detail: "Can also happen due to failure to resolve DNS."
  5006: 'navigation',
  // "Authentication error" — our token, not their page.
  10000: 'provider',
}

/**
 * Classify a Cloudflare failure.
 *
 * Prefers the numeric code and falls back to the message only for codes we have not met. **Anything
 * unrecognised is treated as our fault, not theirs** — a misread auto-disables a working canonical,
 * which is the one outcome worth biasing hard against.
 *
 * The one deliberate exception is `5006`. Cloudflare's own detail says it "can *also* happen due to
 * failure to resolve DNS", so it is genuinely ambiguous between a dead customer domain and a
 * transient fault at their end. It counts as `navigation` (a real failure) because detecting dead
 * domains is the main thing this job exists for, and the three-consecutive-failures ladder is what
 * makes that safe: a blip does not repeat on three separate nights, a dead domain does.
 */
export function classifyRenderError(
  message: string,
  code?: number,
): Extract<RenderResult, { ok: false }>['kind'] {
  if (code != null && code in RENDER_ERROR_CODES) return RENDER_ERROR_CODES[code]

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

  let body: {
    success?: boolean
    result?: string
    errors?: { code?: number; message?: string; detail?: string }[]
  }
  try {
    body = (await response.json()) as typeof body
  } catch {
    return { ok: false, kind: 'provider', detail: `Unparseable response (${response.status}).` }
  }

  if (!response.ok || body.success !== true || typeof body.result !== 'string') {
    const first = body.errors?.[0]
    // Both halves: the message names the class, the detail names the instance
    // ("Waiting for selector `[data-sahaj-atlas-ready]` failed"). The logs are
    // the only place an operator can see why a mount was marked failing.
    const detail =
      [first?.message, first?.detail].filter(Boolean).join(' — ') || `HTTP ${response.status}`
    return { ok: false, kind: classifyRenderError(detail, first?.code), detail }
  }

  return { ok: true, html: body.result }
}
