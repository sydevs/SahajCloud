import type { RoutingMode } from '@/lib/clients/canonical'
import { ROUTING_MODES } from '@/lib/clients/canonical'

/**
 * Reading the widget's readiness marker out of a rendered page.
 *
 * The cross-repo contract (sydevs/SahajAtlasWeb#153, `src/lib/readiness.ts` there): once the widget
 * has genuinely mounted, it writes a JSON payload to `data-sahaj-atlas-ready` on `<html>`.
 *
 * **What this proves, precisely.** It detects an embed that is *installed but not working* — the
 * case a report can never reveal, because the report is sent by the same widget whose health is in
 * question. It does **not** prove the page is honest: the attribute carries no nonce, and any host
 * that can run our script can hand-write it. The trust boundary stays `allowedDomains`, server
 * side. What it does buy against a *third party* holding a stolen key is real, though: they can
 * claim a mount on the client's domain in a report, but they cannot make that domain serve a
 * marker they control.
 */

/** The attribute the widget writes. Changing it is a cross-repo break. */
export const READY_ATTR = 'data-sahaj-atlas-ready'

/** What the marker attests. Mirrors `ReadinessMarker` in SahajAtlasWeb. */
export interface ReadinessMarker {
  /** Contract version of this JSON's shape — stored as `widgetVersion`. */
  v: number
  routing: RoutingMode
  topLevel: boolean
  urlWritable: boolean
}

/**
 * Match the opening `<html …>` tag and pull the attribute out of it.
 *
 * A regex rather than a DOM parse because exactly one attribute on one known element is wanted, and
 * pulling in an HTML parser to read it would be the larger risk. Bounded deliberately: only the
 * document's first `<html` tag is considered, so markup later in the page cannot introduce one.
 */
const HTML_TAG_RE = /<html\b[^>]*>/i
const ATTR_RE = new RegExp(`${READY_ATTR}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')

/** Decode the handful of entities an HTML serializer puts inside an attribute value. */
function decodeAttribute(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
}

/**
 * The marker in `html`, or `null` when it is absent or unusable.
 *
 * Unusable counts as absent on purpose: a marker we cannot parse tells us nothing about whether the
 * widget booted, and treating a malformed one as success would let a broken deploy verify itself.
 */
export function parseReadinessMarker(html: string): ReadinessMarker | null {
  const tag = HTML_TAG_RE.exec(html)?.[0]
  if (!tag) return null

  const match = ATTR_RE.exec(tag)
  const raw = match?.[1] ?? match?.[2]
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(decodeAttribute(raw))
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const marker = parsed as Record<string, unknown>

  const routing = marker.routing
  if (typeof routing !== 'string' || !(ROUTING_MODES as readonly string[]).includes(routing)) {
    return null
  }

  return {
    v: typeof marker.v === 'number' ? marker.v : 0,
    routing: routing as RoutingMode,
    topLevel: marker.topLevel === true,
    urlWritable: marker.urlWritable === true,
  }
}
