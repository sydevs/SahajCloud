/**
 * Canonical-ownership vocabulary for the Sahaj Atlas white-label program (#633).
 *
 * A client may declare that it owns the canonical URLs for its `region` — the
 * page a seeker should land on for events in that region. The declaration is
 * now a single choice (`canonical.embed`): which of the embeds the widget has
 * reported owns those URLs. Host, mount and routing all follow from it, and are
 * filled in by the verification job from what it observed on the live page.
 *
 * Shared by the `Clients` field definitions, the observed-mount metadata
 * (`./embedMetadata`), the verification state (`./verification`), and the
 * OpenAPI shim (which sources the `routing` enum from here so it can't drift
 * from the handler).
 */

import { normalizeHost } from '@/plugins/usage'

/**
 * How the widget encodes its state into the host page's URL.
 *
 * **There is deliberately no `hash` option.** The widget is dropping hash
 * routing entirely, and a canonical URL that resolves only after client-side
 * JS reads `location.hash` is not a canonical URL a crawler can follow.
 */
export const ROUTING_MODES = ['query', 'path'] as const

export type RoutingMode = (typeof ROUTING_MODES)[number]

/** Admin select options for a routing field. */
export const ROUTING_MODE_OPTIONS = ROUTING_MODES.map((value) => ({
  label: value === 'query' ? 'Query parameter' : 'Path segment',
  value,
}))

/**
 * A bare host: lowercase letters, digits, dots and dashes only — no scheme, no
 * port, no path. `allowedDomains` is a newline-separated textarea and is
 * genuinely multi-valued in the data, so the canonical host is stated once,
 * on its own, rather than inferred from it.
 */
export const CANONICAL_DOMAIN_PATTERN = /^[a-z0-9.-]+$/

export function isValidCanonicalDomain(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && CANONICAL_DOMAIN_PATTERN.test(value)
}

/**
 * Normalize a raw host into the `canonical.domain` form, or return `null` when
 * nothing host-like survives. Accepts what the legacy Atlas config stored — a
 * bare host, occasionally with a scheme or a trailing path.
 *
 * Delegates the parsing to `normalizeHost`, the origin-enforcement helper that
 * already reduces exactly these shapes to a bare host, rather than keeping a
 * second URL-normalizer that could drift from it. One thing it does that we
 * must not inherit: it *preserves* a `*.` wildcard label, because allowlist
 * patterns are allowed to be wildcards while a canonical domain names one
 * page's host. {@link CANONICAL_DOMAIN_PATTERN} rejects those for free — `*`
 * is not in its character class.
 */
export function normalizeCanonicalDomain(raw: string | null | undefined): string | null {
  const host = normalizeHost(raw)
  return host && isValidCanonicalDomain(host) ? host : null
}
