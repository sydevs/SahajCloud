import type { RenderDeps, RenderResult } from './browserRendering'

import { randomBytes } from 'node:crypto'

import type { PathProbeResult, VerificationResult } from '@/lib/clients/verification'
import { splitMountKey } from '@/lib/clients/verification'

import { renderPage } from './browserRendering'
import { parseReadinessMarker, READY_ATTR } from './readinessMarker'

/**
 * Verify that the embed an operator nominated is really on the page and working.
 *
 * Loads the mount in a real browser, waits for the widget's readiness marker, and turns what came
 * back into the `VerificationResult` the state machine folds in.
 *
 * The whole design rests on one split, so it is worth stating plainly: a **failed** result is
 * evidence about the customer's embed and counts toward the three-strikes budget; an
 * **inconclusive** one means we could not look and must change nothing. Cloudflare's REST API
 * reports both through the same error channel, so `classifyRenderError` biases every unrecognised
 * message to inconclusive — auto-disabling a working canonical because our token lapsed would
 * change live public URLs for no reason.
 */

/** Map a render outcome onto the verification vocabulary. Pure, so the split is testable. */
export function resultFromRender(mountKey: string, render: RenderResult): VerificationResult {
  if (!render.ok) {
    switch (render.kind) {
      case 'navigation':
        return { status: 'failed', reason: 'dns', detail: render.detail }
      case 'selector-timeout':
        // The page loaded and the marker never appeared: the embed is installed-but-not-working,
        // or gone. Either way it cannot carry a canonical URL.
        return { status: 'failed', reason: 'marker-absent', detail: render.detail }
      case 'unconfigured':
        return { status: 'inconclusive', reason: 'not-configured', detail: render.detail }
      case 'quota':
        return { status: 'inconclusive', reason: 'quota', detail: render.detail }
      default:
        return { status: 'inconclusive', reason: 'provider-error', detail: render.detail }
    }
  }

  const marker = parseReadinessMarker(render.html)
  if (!marker) {
    return { status: 'failed', reason: 'marker-absent', detail: 'No readiness marker in the page.' }
  }

  const parts = splitMountKey(mountKey)
  if (!parts) {
    return { status: 'failed', reason: 'http', detail: `Unparseable mount: ${mountKey}` }
  }

  return {
    status: 'verified',
    embed: {
      domain: parts.domain,
      mount: parts.mount,
      // Read off the rendered page, not off the client's report — this is what makes routing
      // server-attested rather than self-reported.
      routing: marker.routing,
      widgetVersion: marker.v,
      at: new Date().toISOString(),
    },
  }
}

/**
 * True when `value` is a mount we are willing to send a browser at.
 *
 * `canonical.embed` normally comes from the picker, whose options are report keys that
 * `parseMountKey` has already constrained to http(s) — but it is a plain text field, so an admin
 * can type into it, and this is the point where a string becomes an outbound page load. Refusing
 * anything but http(s) keeps `data:`, `file:` and `javascript:` out of the renderer.
 */
function isFetchableMount(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** Load and judge one mount. Never throws. */
export async function verifyEmbed(
  mountKey: string,
  deps: RenderDeps = {},
): Promise<VerificationResult> {
  if (!splitMountKey(mountKey) || !isFetchableMount(mountKey)) {
    return { status: 'failed', reason: 'http', detail: `Unparseable mount: ${mountKey}` }
  }
  const render = await renderPage(mountKey, `[${READY_ATTR}]`, deps)
  return resultFromRender(mountKey, render)
}

/**
 * The two URLs the path-routing probe loads, or `null` when this mount cannot
 * path-route at all.
 *
 * **One derivation, and both halves come off the mount key.** That is what
 * keeps an operator-typed string out of the renderer: `probe` is the mount's
 * own pathname plus one extra segment, `control` is the same token at the bare
 * origin, and nothing else can reach {@link renderPage} from here.
 *
 * A mount carrying a query string returns `null` rather than a URL: path
 * routing would have to append segments after the `?`, and `canonicalUrlBase`
 * refuses that combination outright. Spending a render to learn what the URL
 * builder already knows would be waste.
 */
export function pathProbeUrls(
  mountKey: string,
  token: string,
): { probe: string; control: string } | null {
  if (!isFetchableMount(mountKey)) return null
  const url = new URL(mountKey)
  if (url.search) return null

  const base = url.pathname.replace(/\/+$/, '')
  return { probe: `${url.origin}${base}/${token}`, control: `${url.origin}/${token}` }
}

/**
 * A path segment no host could be serving on purpose.
 *
 * Random per run, and never a real region slug: a site could have hand-built
 * `/gb/london` as an ordinary page, and one working page proves nothing about
 * the subtree. The prefix is there so an operator reading their own access log
 * can tell what hit them.
 */
function probeToken(): string {
  return `sahaj-atlas-probe-${randomBytes(8).toString('hex')}`
}

/** Injectable so a test can pin the token, and drive both renders without an account. */
export interface PathProbeDeps extends RenderDeps {
  token?: () => string
  render?: (url: string, waitForSelector: string) => Promise<RenderResult>
}

/**
 * Does this host serve our atlas under the embed's whole subtree?
 *
 * The one question that decides path routing, and the only way to answer it is
 * to look: the deciding condition lives in the host's server (a rewrite rule, a
 * WordPress permalink setting), and the widget cannot see it from the browser.
 *
 * **Positive only when the prefixed render carries the readiness marker and the
 * control render does not.** The control is what a host mounting the widget on
 * its own 404 page fails — such a site answers *every* unknown path with a
 * running widget, which looks identical to a working rewrite until you ask it
 * for a path outside the mount.
 *
 * The control render is spent only when the first one came back positive, so a
 * host that plainly does not path-route costs one render, not two.
 */
export async function probePathRouting(
  mountKey: string,
  deps: PathProbeDeps = {},
): Promise<PathProbeResult> {
  const urls = pathProbeUrls(mountKey, (deps.token ?? probeToken)())
  if (!urls) {
    return { status: 'negative', detail: `Mount cannot carry path routing: ${mountKey}` }
  }

  const render = deps.render ?? ((url: string, selector: string) => renderPage(url, selector, deps))

  const probeVerdict = probeRenderVerdict(await render(urls.probe, `[${READY_ATTR}]`))
  if (probeVerdict.status !== 'positive') return probeVerdict

  const controlVerdict = probeRenderVerdict(await render(urls.control, `[${READY_ATTR}]`))
  // An inconclusive control is not evidence either way — we could not establish
  // that the host *stops* serving the widget outside the mount.
  if (controlVerdict.status === 'inconclusive') return controlVerdict
  if (controlVerdict.status === 'positive') {
    return {
      status: 'negative',
      detail: 'The host serves the widget at the origin root too — a catch-all, not a rewrite.',
    }
  }
  return { status: 'positive' }
}

/**
 * One probe render, in the probe's vocabulary.
 *
 * Same split as {@link resultFromRender}: a page that answered and carried no
 * marker is evidence about the host, everything we could not look at is not.
 */
function probeRenderVerdict(render: RenderResult): PathProbeResult {
  if (render.ok) {
    return parseReadinessMarker(render.html)
      ? { status: 'positive' }
      : { status: 'negative', detail: 'No readiness marker under the probed path.' }
  }
  switch (render.kind) {
    case 'navigation':
    case 'selector-timeout':
      return { status: 'negative', detail: render.detail }
    default:
      return { status: 'inconclusive', detail: render.detail }
  }
}
