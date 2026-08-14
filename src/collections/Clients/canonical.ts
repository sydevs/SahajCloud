/**
 * Canonical-ownership vocabulary for the Sahaj Atlas white-label program (#633).
 *
 * A client may declare that it owns the canonical URLs for its `region` — the
 * page a seeker should land on for events in that region. The declaration is
 * three parts: the host (`canonical.domain`), the page the embed lives on
 * (`canonical.mount`), and how the widget encodes state into that URL
 * (`canonical.routing`).
 *
 * Shared by the `Clients` field definitions, the observed-mount metadata
 * (`./embedMetadata`), and `scripts/backfill-client-canonical.ts`.
 */

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
 */
export function normalizeCanonicalDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return null

  let host: string
  try {
    host = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname
  } catch {
    return null
  }

  host = host.replace(/\.$/, '') // trailing-dot FQDN form
  return isValidCanonicalDomain(host) ? host : null
}
