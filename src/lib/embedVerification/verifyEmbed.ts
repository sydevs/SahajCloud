import type { RenderDeps, RenderResult } from './browserRendering'

import { randomBytes } from 'node:crypto'

import type { RoutingProbeResult, VerificationResult } from '@/lib/clients/verification'
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
      // No `routing` here. The marker's copy is the widget repeating its own script parameter,
      // and `routingProbe` now answers that question from the host's server (#644). Recording it
      // twice only invites the wrong read — the widget's report is still kept, as a report, in
      // `embedMetadata`.
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
 * The two URLs the routing probe loads, or `null` when this mount cannot
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
export function routingProbeUrls(
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
export interface RoutingProbeDeps extends RenderDeps {
  token?: () => string
  render?: (url: string) => Promise<RenderResult>
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
 * **Both renders start together, and the verdict logic below is unchanged** —
 * it still reads the probe first, so only the latency differs. Sequentially the
 * promote path was three 45s renders end to end (mount, probe, control), and
 * Cloudflare abandons an origin response at 100s: the one "Verify now" press
 * that actually promoted a service answered the operator with a 524, after the
 * row had already been written. Overlapping the two probe renders keeps the
 * worst case under that ceiling.
 *
 * The cost is one render on a host that fails the probe, where the control used
 * to be skipped. #644 budgets three per enabled owner, and that is what this
 * spends.
 */
export async function probeRouting(
  mountKey: string,
  deps: RoutingProbeDeps = {},
): Promise<RoutingProbeResult> {
  const urls = routingProbeUrls(mountKey, (deps.token ?? probeToken)())
  if (!urls) {
    return { status: 'negative', detail: `Mount cannot carry path routing: ${mountKey}` }
  }

  const render = deps.render ?? ((url: string) => renderPage(url, `[${READY_ATTR}]`, deps))

  const [probeRender, controlRender] = await Promise.all([render(urls.probe), render(urls.control)])

  const probeVerdict = probeRenderVerdict(urls.probe, probeRender)
  if (probeVerdict.status !== 'positive') return probeVerdict

  const controlVerdict = probeRenderVerdict(urls.control, controlRender)
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
 * Deliberately a **renaming** of {@link resultFromRender} rather than a second
 * classifier. The split it makes — the page answered and carried no marker
 * (evidence about their server) versus we could not look (evidence about
 * nothing) — is the one the whole design rests on, and it is pinned by the live
 * Cloudflare error-code fixtures. A parallel `switch` here could drift from it
 * silently, and only one of the two would be under test.
 */
function probeRenderVerdict(url: string, render: RenderResult): RoutingProbeResult {
  const result = resultFromRender(url, render)
  if (result.status === 'verified') return { status: 'positive' }
  return {
    status: result.status === 'failed' ? 'negative' : 'inconclusive',
    detail: result.detail,
  }
}

/**
 * Whether to probe this owner at all, and what a skipped probe means.
 *
 * Gated on the mount run's own outcome, which is what bounds the render budget
 * at three per enabled owner — and at **one** for an owner whose mount is not
 * working, the common failing case:
 *
 * | mount outcome  | probe                                                      |
 * | -------------- | ---------------------------------------------------------- |
 * | `verified`     | render the token path, and the control if that one carries |
 * | `failed`       | a negative, spending no render — the widget is not on the page at all, so the subtree cannot be serving it |
 * | `inconclusive` | nothing happens, exactly as the mount ladder does           |
 *
 * Shared by the nightly job and the on-demand endpoint, so a button press and a
 * scheduled run spend the same renders and fold in the same verdict. The probe
 * is a parameter because the job injects a stub for it.
 */
export async function probeForOutcome(
  mountKey: string,
  outcome: VerificationResult,
  probe: (mountKey: string) => Promise<RoutingProbeResult>,
): Promise<RoutingProbeResult> {
  if (outcome.status === 'inconclusive') return { status: 'inconclusive', detail: outcome.reason }
  if (outcome.status === 'failed') {
    return { status: 'negative', detail: `Mount verification failed: ${outcome.reason}` }
  }
  return probe(mountKey)
}
