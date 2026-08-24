import type { RenderDeps, RenderResult } from './browserRendering'

import type { VerificationResult } from '@/lib/clients/verification'
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
